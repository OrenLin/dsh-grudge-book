import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { setImmediate } from 'node:timers'
import { grudgeDomain } from './storage.js'
import { analyzeMessage, churnEntry, tagsFor, type RuleContext } from './rules.js'
import { buildView, commentFor } from './aggregate.js'
import { copyFor, HOST_LABELS } from './copy.js'
import { allowHit, evictOverflow } from './throttle.js'
import { bookEntrySchema } from '../shared/contract.js'
import type {
  AckResult,
  AppealResult,
  BookEntry,
  BookView,
  ConfessResult,
  FoldStatus,
  FoldResult,
  HeadResult,
  Lang,
  LangChoice,
  MeritKind,
  MeritResult,
  Prefs,
  ResetResult,
  Scores,
  SessionProgress,
} from '../shared/contract.js'

/** Minimal structural view of the Session objects the Host hands us. */
export interface EventLike {
  type: string
  seq: number
  time: number
  data: unknown
}

export interface SessionLike {
  header: HeaderLike
  ownEvents(): readonly EventLike[]
}

export interface HeaderLike {
  id: string
  cwd?: string
}

/** Structural views of optional Host services (probed at runtime). */
interface SessionQueryLike {
  listSessions(): Promise<readonly { header: HeaderLike; live: boolean }[]>
}

interface PersistenceHandleLike {
  read(offset?: number, length?: number): Promise<{ events: readonly EventLike[] }>
  close(): Promise<void>
}

interface PersistenceLike {
  open(id: string, access: 'read'): Promise<PersistenceHandleLike>
}

interface SessionsLike {
  get(id: string): SessionLike | undefined
}

const DEFAULT_PREFS: Prefs = {
  style: 'balanced',
  sensitivity: 'standard',
  lang: 'auto',
  langResolved: 'zh',
}

/** Rules whose heuristics most often misfire — appeals against them succeed. */
const APPEALABLE = new Set(['rush', 'late-night', 'vague-redo', 'vibe-words', 'both-ways'])

const MERIT_DELTAS: Record<MeritKind, Partial<Scores>> = {
  oss: { appreciation: 5, contribution: 10 },
  help: { appreciation: 4, contribution: 6 },
  docs: { appreciation: 6, contribution: 8 },
  other: { appreciation: 3, contribution: 3 },
}

/** Hard cap on stored entries; oldest are evicted beyond this. */
const MAX_ENTRIES = 10_000

/** Rule-engine input cap (chars) — keeps regex work bounded on huge prompts. */
const ANALYSIS_TEXT_LIMIT = 2000

/** Cold-session replay page size (events per storage read). */
const COLD_PAGE = 500

/** Aggregation cache TTL — scores decay continuously, so bound staleness. */
const VIEW_CACHE_MS = 30_000

/** Sliding-window limits per action bucket (per user, per process). */
const RATE_LIMITS = {
  interact: { limit: 20, windowMs: 60_000 },
  merit: { limit: 10, windowMs: 60_000 },
  prefs: { limit: 30, windowMs: 60_000 },
  reset: { limit: 5, windowMs: 60_000 },
} as const

type RateBucket = keyof typeof RATE_LIMITS

function textOfContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (
      block !== null
      && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ) {
      out += `${(block as { text: string }).text}\n`
    }
  }
  return out.trim()
}

function isHumanUserMessage(data: unknown): data is { content: unknown } {
  if (data === null || typeof data !== 'object') return false
  const source = (data as { source?: unknown }).source
  return (
    source !== null && typeof source === 'object' && (source as { kind?: unknown }).kind === 'user'
  )
}

function dayOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

/** Short human hint for the session currently being folded. */
function shortSessionName(header: HeaderLike): string {
  const leaf = header.cwd?.split('/').filter(Boolean).at(-1)
  return leaf !== undefined && leaf.length > 0 ? leaf : header.id.slice(0, 12)
}

/** One applyEvent run's mutable state, owned by the caller. */
interface FoldState {
  progress: SessionProgress
  writes: BookEntry[]
  entries: BookEntry[]
}

export class GrudgeBookService extends TypertRemoteService {
  static inject = ['storageDomain', 'agents']

  private readonly ready: Promise<Domain<typeof grudgeDomain>>
  private revision = 0
  private prefsValue: Prefs = { ...DEFAULT_PREFS }
  private entriesList: BookEntry[] = []
  private entriesLoaded = false
  private readonly progressCache = new Map<string, SessionProgress>()
  private readonly chains = new Map<string, Promise<unknown>>()
  private readonly lastHumanText = new Map<string, string>()
  private readonly turnToolCalls = new Map<string, number>()
  private closed = false

  // v3: aggregation cache, write throttling, poison-record guard, fold state.
  private cachedView:
    | { sessionId: string; view: BookView; revision: number; at: number }
    | undefined
  private readonly rateHits = new Map<RateBucket, number[]>()
  private poisonWarned = false
  private fold: FoldStatus = { running: false, total: 0, done: 0, failed: 0, added: 0 }
  private foldCancelRequested = false

  constructor(ctx: Context) {
    super(ctx, 'grudgeBook')
    this.ready = ctx.storageDomain.open(grudgeDomain).then(async (domain) => {
      for (const [id, progress] of domain.table('progress').entries()) {
        this.progressCache.set(id, progress)
      }
      const prefs = domain.table('prefs').get('current')
      if (prefs !== undefined) this.prefsValue = prefs
      return domain
    })
    this.ready.catch(() => undefined)
    // The caller owns the domain handle; mark closure when the plugin ends.
    ctx.effect(() => () => {
      this.closed = true
      this.foldCancelRequested = true
    })
  }

  /** Output language resolved from prefs (frozen fields use this at write time). */
  private get lang(): Lang {
    return this.prefsValue.langResolved ?? 'zh'
  }

  /** Fetch an optional Host service without making it a hard dependency. */
  private service<T>(name: string): T | undefined {
    return (this.ctx as unknown as { get(name: string): unknown }).get(name) as T | undefined
  }

  private async domain(): Promise<Domain<typeof grudgeDomain>> {
    return this.ready
  }

  /** All entries, loaded lazily; malformed stored records are skipped once. */
  private async allEntries(): Promise<BookEntry[]> {
    if (!this.entriesLoaded) {
      const domain = await this.domain()
      const list: BookEntry[] = []
      let skipped = 0
      for (const [, raw] of domain.table('entries').entries()) {
        const parsed = bookEntrySchema.safeParse(raw)
        if (parsed.success) list.push(parsed.data)
        else skipped += 1
      }
      if (skipped > 0 && !this.poisonWarned) {
        this.poisonWarned = true
        this.ctx.logger.warn(`grudge-book: skipped ${skipped} malformed stored entries`)
      }
      this.entriesList = list
      this.entriesLoaded = true
    }
    return this.entriesList
  }

  private progressOf(sessionId: string): SessionProgress {
    return this.progressCache.get(sessionId) ?? { seq: 0, toolCalls: 0, turns: 0 }
  }

  /** Serialize per-session work (FIFO); failures never block the next task. */
  private enqueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const pending = (this.chains.get(sessionId) ?? Promise.resolve()).then(work)
    this.chains.set(sessionId, pending.catch(() => undefined))
    return pending
  }

  /** Bump revision and drop the aggregation cache. Every write path calls this. */
  private bump(): void {
    this.revision += 1
    this.cachedView = undefined
  }

  /** Sliding-window throttle for interactive writes. */
  private allowRate(bucket: RateBucket): boolean {
    const spec = RATE_LIMITS[bucket]
    const now = Date.now()
    const { ok, kept } = allowHit(
      this.rateHits.get(bucket) ?? [],
      now,
      spec.limit,
      spec.windowMs,
    )
    this.rateHits.set(bucket, kept)
    return ok
  }

  // -----------------------------------------------------------------------
  // Event analysis
  // -----------------------------------------------------------------------

  /** Live event hook — call from ctx.on('session/event'). Never throws. */
  handleEvent(session: SessionLike, event: EventLike): void {
    void this.enqueue(session.header.id, () => this.processEvent(session, event)).catch(
      (error: unknown) => {
        this.ctx.logger.warn(`grudge-book: event ${event.type} failed: ${String(error)}`)
      },
    )
  }

  /** Fold one live session's full log from its watermark. Call on agent/created. */
  foldSession(session: SessionLike): Promise<number> {
    return this.enqueue(session.header.id, async () => {
      let added = 0
      for (const event of session.ownEvents()) {
        if (this.closed) break
        if (event.seq <= this.progressOf(session.header.id).seq) continue
        added += await this.processEvent(session, event)
      }
      return added
    })
  }

  /**
   * Analyze one event in place (caller holds the per-session chain).
   * @returns number of entries written.
   */
  private async processEvent(session: SessionLike, event: EventLike): Promise<number> {
    if (this.closed || event.seq <= this.progressOf(session.header.id).seq) return 0
    const progress = { ...this.progressOf(session.header.id) }
    const state: FoldState = {
      progress,
      writes: [],
      entries: await this.allEntries(),
    }
    this.applyEvent(session.header, event, state)
    progress.seq = event.seq
    await this.evictAndPersist(session.header.id, progress, state.writes)
    return state.writes.length
  }

  /**
   * Pure synchronous analysis core — no IO, so cold replay can batch a whole
   * page of events and persist once at the end.
   */
  private applyEvent(header: HeaderLike, event: EventLike, state: FoldState): void {
    if (event.seq <= state.progress.seq) return
    const sid = header.id
    const project = header.cwd ?? 'unknown'
    const { progress, entries } = state

    const writeEntry = (entry: BookEntry): void => {
      state.writes.push(entry)
      entries.push(entry)
    }

    const localHour = new Date(event.time).getHours()

    if (event.type === 'user/message' && isHumanUserMessage(event.data)) {
      const text = textOfContent((event.data as { content: unknown }).content).slice(
        0,
        ANALYSIS_TEXT_LIMIT,
      )
      if (text.length > 0) {
        const ruleCtx: RuleContext = {
          text,
          time: event.time,
          hour: localHour,
          lang: this.lang,
          sensitivity: this.prefsValue.sensitivity,
          previousText: this.lastHumanText.get(sid),
          sameRuleCount: (ruleId: string) =>
            entries.filter((e) => e.sessionId === sid && e.ruleId === ruleId).length,
          lastFiredDay: (ruleId: string) =>
            entries
              .filter((e) => e.sessionId === sid && e.ruleId === ruleId)
              .map((e) => dayOf(e.time))
              .at(-1),
        }
        for (const match of analyzeMessage(ruleCtx)) {
          const streak = ruleCtx.sameRuleCount(match.ruleId) + 1
          writeEntry({
            id: `${sid}:${event.seq}:${match.ruleId}`,
            sessionId: sid,
            seq: event.seq,
            time: event.time,
            kind: match.kind,
            ruleId: match.ruleId,
            title: match.title,
            quote: match.quote,
            aiComment: commentFor(this.prefsValue, match.ruleId, match.kind, streak, match.quote),
            tags: match.tags,
            deltas: match.deltas,
            severity: match.severity,
            project,
            streak,
            resolved: 'none',
          })
        }
        this.lastHumanText.set(sid, text)
      }
    } else if (event.type === 'tool/call') {
      this.turnToolCalls.set(sid, (this.turnToolCalls.get(sid) ?? 0) + 1)
      progress.toolCalls += 1
    } else if (event.type === 'turn/start') {
      this.turnToolCalls.set(sid, 0)
    } else if (event.type === 'turn/end') {
      progress.turns += 1
      const today = dayOf(event.time)
      const churnToday = entries.filter(
        (e) => e.sessionId === sid && e.ruleId === 'churn' && !e.quiet && dayOf(e.time) === today,
      ).length
      const churn = churnEntry(this.turnToolCalls.get(sid) ?? 0, this.lang, churnToday)
      if (churn !== null) {
        const streak = entries.filter((e) => e.sessionId === sid && e.ruleId === 'churn').length + 1
        writeEntry({
          id: `${sid}:${event.seq}:churn`,
          sessionId: sid,
          seq: event.seq,
          time: event.time,
          kind: 'gold',
          ruleId: 'churn',
          title: churn.title,
          quote: HOST_LABELS[this.lang].churnQuote,
          aiComment: commentFor(this.prefsValue, 'churn', 'gold', streak, ''),
          tags: tagsFor('churn', this.lang),
          deltas: churn.deltas,
          severity: 0,
          project,
          streak,
          resolved: 'none',
          ...(churn.quiet ? { quiet: true } : {}),
        })
      }
      this.turnToolCalls.set(sid, 0)
    }
  }

  /** Persist one fold step's writes, evicting oldest entries beyond the cap. */
  private async evictAndPersist(
    sid: string,
    progress: SessionProgress,
    writes: BookEntry[],
  ): Promise<void> {
    const domain = await this.domain()
    const entries = await this.allEntries()
    let evicted = 0
    if (entries.length > MAX_ENTRIES) {
      for (const victim of evictOverflow(entries, MAX_ENTRIES)) {
        await domain.table('entries').delete(victim.id)
        const index = entries.indexOf(victim)
        if (index >= 0) entries.splice(index, 1)
        evicted += 1
      }
    }
    for (const entry of writes) {
      await domain.table('entries').put(entry.id, entry)
    }
    await domain.table('progress').put(sid, progress)
    this.progressCache.set(sid, progress)
    if (writes.length > 0 || evicted > 0) this.bump()
  }

  // -----------------------------------------------------------------------
  // Historical fold (cold sessions from storage)
  // -----------------------------------------------------------------------

  /** Replay one stored session page by page, serialized on its chain. */
  private async foldStoredSession(header: { id: string; cwd?: string }): Promise<number> {
    const persistence = this.service<PersistenceLike>('sessionPersistence')
    if (persistence === undefined) throw new Error('sessionPersistence unavailable')
    const handle = await persistence.open(header.id, 'read')
    try {
      let offset = 0
      let added = 0
      for (;;) {
        if (this.closed || this.foldCancelRequested) break
        const page = await handle.read(offset, COLD_PAGE)
        if (page.events.length === 0) break
        const events = page.events
        added += await this.enqueue(header.id, async () => {
          const progress = { ...this.progressOf(header.id) }
          const state: FoldState = {
            progress,
            writes: [],
            entries: await this.allEntries(),
          }
          for (const event of events) {
            if (this.closed) break
            this.applyEvent(header, event, state)
            if (event.seq > progress.seq) progress.seq = event.seq
          }
          await this.evictAndPersist(header.id, progress, state.writes)
          return state.writes.length
        })
        offset += events.length
        if (events.length < COLD_PAGE) break
        await yieldToEventLoop()
      }
      return added
    } finally {
      await handle.close().catch(() => undefined)
    }
  }

  private async runFoldAll(query: SessionQueryLike): Promise<void> {
    const records = await query.listSessions()
    this.fold.total = records.length
    const sessions = this.service<SessionsLike>('sessions')
    for (const record of records) {
      if (this.closed || this.foldCancelRequested) break
      const header = record.header
      this.fold.current = shortSessionName(header)
      try {
        const live = sessions?.get(header.id)
        if (live !== undefined) {
          this.fold.added += await this.foldSession(live)
        } else {
          this.fold.added += await this.foldStoredSession(header)
        }
        this.fold.done += 1
      } catch (error) {
        this.fold.failed += 1
        this.fold.lastError = String(error)
        this.ctx.logger.warn(`grudge-book: fold failed for ${header.id}: ${String(error)}`)
      }
      await yieldToEventLoop()
    }
  }

  // -----------------------------------------------------------------------
  // Remote API
  // -----------------------------------------------------------------------

  @Remote
  async getBook(sessionId: string): Promise<BookView> {
    const cached = this.cachedView
    if (
      cached !== undefined
      && cached.sessionId === sessionId
      && cached.revision === this.revision
      && Date.now() - cached.at < VIEW_CACHE_MS
    ) {
      return cached.view
    }
    const view = buildView({
      entries: await this.allEntries(),
      progressOf: (id) => this.progressCache.get(id),
      sessionId,
      revision: this.revision,
      // Normalize so a fresh Host always reports the full prefs shape; an
      // older Host (pre-i18n) omits lang fields and the client hides the
      // language UI accordingly.
      prefs: {
        ...this.prefsValue,
        lang: this.prefsValue.lang ?? 'auto',
        langResolved: this.prefsValue.langResolved ?? 'zh',
      },
      now: Date.now(),
    })
    this.cachedView = { sessionId, view, revision: this.revision, at: Date.now() }
    return view
  }

  @Remote
  async head(): Promise<HeadResult> {
    return { revision: this.revision }
  }

  @Remote
  async ensureFolded(sessionId: string): Promise<FoldResult> {
    const agent = this.ctx.get('agents')?.get(sessionId as SessionId)
    const session = (agent as { session?: SessionLike } | undefined)?.session
    if (session === undefined) return { added: 0 }
    const added = await this.foldSession(session)
    return { added }
  }

  @Remote
  async foldAll(): Promise<AckResult> {
    const labels = HOST_LABELS[this.lang]
    if (this.fold.running) return { ok: false, message: labels.foldAlreadyRunning }
    const query = this.service<SessionQueryLike>('sessionQuery')
    if (query === undefined) return { ok: false, message: labels.foldUnavailable }
    this.foldCancelRequested = false
    this.fold = { running: true, total: 0, done: 0, failed: 0, added: 0, startedAt: Date.now() }
    void this.runFoldAll(query)
      .catch((error: unknown) => {
        this.fold.lastError = String(error)
      })
      .finally(() => {
        this.fold.running = false
        this.fold.finishedAt = Date.now()
        this.fold.current = undefined
      })
    return { ok: true, message: labels.foldStarted }
  }

  @Remote
  async foldStatus(): Promise<FoldStatus> {
    return { ...this.fold }
  }

  @Remote
  async foldCancel(): Promise<AckResult> {
    const labels = HOST_LABELS[this.lang]
    if (!this.fold.running) return { ok: false, message: labels.foldNotRunning }
    this.foldCancelRequested = true
    return { ok: true, message: labels.foldCancelled }
  }

  @Remote
  async confess(entryId: string, text: string): Promise<ConfessResult> {
    const labels = HOST_LABELS[this.lang]
    if (!this.allowRate('interact')) {
      return { ok: false, message: labels.rateLimited, relief: 0 }
    }
    const domain = await this.domain()
    const entry = domain.table('entries').get(entryId)
    if (entry === undefined || entry.kind !== 'red' || entry.resolved !== 'none') {
      return { ok: false, message: labels.confessNotAllowed, relief: 0 }
    }
    if (text.trim().length < 6) {
      return { ok: false, message: copyFor(this.prefsValue.style, this.lang).confessRejected[0], relief: 0 }
    }
    const sincere =
      text.trim().length >= 20 ||
      /(对不起|抱歉|我错|我的问题|以后不|sorry|apolog|my bad|my fault|won'?t do (that|it) again)/i.test(text)
    const relief = sincere ? 5 : 3
    const updated: BookEntry = {
      ...entry,
      resolved: 'confessed',
      resolutionNote: text.trim().slice(0, 200),
      deltas: {
        ...entry.deltas,
        resentment: Math.max(-relief, (entry.deltas.resentment ?? 0) - relief),
      },
    }
    await domain.table('entries').put(entryId, updated)
    const list = await this.allEntries()
    const index = list.findIndex((e) => e.id === entryId)
    if (index >= 0) list[index] = updated
    this.bump()
    const pack = copyFor(this.prefsValue.style, this.lang)
    return {
      ok: true,
      message: sincere ? pack.confessAccepted[1] : pack.confessAccepted[0],
      relief,
    }
  }

  @Remote
  async appeal(entryId: string, text: string): Promise<AppealResult> {
    const labels = HOST_LABELS[this.lang]
    if (!this.allowRate('interact')) {
      return { ok: false, message: labels.rateLimited }
    }
    const domain = await this.domain()
    const entry = domain.table('entries').get(entryId)
    if (entry === undefined || entry.resolved !== 'none' || entry.kind === 'gold') {
      return { ok: false, message: labels.appealNotAllowed }
    }
    const pack = copyFor(this.prefsValue.style, this.lang)
    if (APPEALABLE.has(entry.ruleId)) {
      const updated: BookEntry = {
        ...entry,
        resolved: 'appealed',
        resolutionNote: text.trim().slice(0, 200),
      }
      await domain.table('entries').put(entryId, updated)
      const list = await this.allEntries()
      const index = list.findIndex((e) => e.id === entryId)
      if (index >= 0) list[index] = updated
      this.bump()
      return { ok: true, message: pack.appealAccepted[0] }
    }
    return { ok: false, message: pack.appealRejected[0] }
  }

  @Remote
  async addMerit(kind: MeritKind, text: string): Promise<MeritResult> {
    const labels = HOST_LABELS[this.lang]
    if (!this.allowRate('merit')) {
      return { ok: false, message: labels.rateLimited }
    }
    const domain = await this.domain()
    const trimmed = text.trim()
    if (trimmed.length < 4) return { ok: false, message: labels.meritTooShort }
    const now = Date.now()
    const streak = (await this.allEntries()).filter((e) => e.ruleId === 'merit').length + 1
    const entry: BookEntry = {
      id: `merit:${now}:${Math.floor(Math.random() * 1e6)}`,
      sessionId: 'merit-box',
      seq: 0,
      time: now,
      kind: 'gold',
      ruleId: 'merit',
      title: HOST_LABELS[this.lang].meritTitle(trimmed),
      quote: trimmed.slice(0, 120),
      aiComment: commentFor(this.prefsValue, 'merit', 'gold', streak, trimmed),
      tags: [...tagsFor('merit', this.lang), kind],
      deltas: MERIT_DELTAS[kind],
      severity: 0,
      project: 'merit-box',
      streak,
      resolved: 'none',
    }
    await domain.table('entries').put(entry.id, entry)
    ;(await this.allEntries()).push(entry)
    this.bump()
    return { ok: true, message: copyFor(this.prefsValue.style, this.lang).meritAccepted[0] }
  }

  @Remote
  async setPrefs(
    style?: Prefs['style'],
    sensitivity?: Prefs['sensitivity'],
    lang?: LangChoice,
    langResolved?: Lang,
  ): Promise<Prefs> {
    if (!this.allowRate('prefs')) return { ...this.prefsValue }
    const domain = await this.domain()
    if (style !== undefined) this.prefsValue = { ...this.prefsValue, style }
    if (sensitivity !== undefined) this.prefsValue = { ...this.prefsValue, sensitivity }
    if (lang !== undefined) this.prefsValue = { ...this.prefsValue, lang }
    if (langResolved !== undefined) this.prefsValue = { ...this.prefsValue, langResolved }
    await domain.table('prefs').put('current', this.prefsValue)
    this.bump()
    return { ...this.prefsValue }
  }

  @Remote
  async reset(confirm?: 'burn'): Promise<ResetResult> {
    const labels = HOST_LABELS[this.lang]
    if (confirm !== 'burn') return { ok: false, message: labels.resetRejected }
    if (!this.allowRate('reset')) return { ok: false, message: labels.rateLimited }
    const domain = await this.domain()
    const entries = domain.table('entries')
    for (const [id] of entries.entries()) {
      await entries.delete(id)
    }
    const progress = domain.table('progress')
    for (const [id] of progress.entries()) {
      await progress.delete(id)
    }
    this.entriesList = []
    this.entriesLoaded = true
    this.progressCache.clear()
    this.lastHumanText.clear()
    this.turnToolCalls.clear()
    this.bump()
    return { ok: true, message: copyFor(this.prefsValue.style, this.lang).resetDone[0] }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    grudgeBook: GrudgeBookService
  }
}
