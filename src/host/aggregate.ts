import type {
  BookEntry,
  BookView,
  Lang,
  Prefs,
  ProjectCard,
  Scores,
  SessionProgress,
  Tier,
} from '../shared/contract.js'
import { copyFor, renderComment, HOST_LABELS, type ImpressionContext } from './copy.js'

const DAY = 86_400_000

/** Half-life per axis, in days. */
const HALF_LIFE_DAYS: Record<keyof Scores, number> = {
  appreciation: 30,
  resentment: 14,
  confusion: 7,
  // Slow-decay axes: contribution/collusion/trust are durable reputation.
  patience: 3,
  contribution: 90,
  collusion: 60,
  trust: 45,
}

/** Weight of the red-page repetition damper: k-th identical rule scores 1/(1+0.25(k-1)). */
const REPEAT_DAMP = 0.25

const EMPTY_SCORES: Scores = {
  appreciation: 0,
  resentment: 0,
  confusion: 0,
  patience: 0,
  contribution: 0,
  collusion: 0,
  trust: 0,
}

function decay(total: number, halfLifeDays: number, now: number, entryTime: number): number {
  if (total === 0) return 0
  const ageDays = Math.max(0, (now - entryTime) / DAY)
  return total * Math.pow(0.5, ageDays / halfLifeDays)
}

/**
 * Effective scores: each entry's delta decays individually, red-page deltas
 * are damped by same-rule repetition, confessed/appealed entries count half.
 */
export function effectiveScores(entries: BookEntry[], now: number): Scores {
  const result: Scores = { ...EMPTY_SCORES }
  const perRuleStreak = new Map<string, number>()
  for (const entry of entries) {
    const k = (perRuleStreak.get(`${entry.sessionId}:${entry.ruleId}`) ?? 0) + 1
    perRuleStreak.set(`${entry.sessionId}:${entry.ruleId}`, k)
    const repeatFactor = entry.kind === 'red' ? 1 / (1 + REPEAT_DAMP * (k - 1)) : 1
    const resolvedFactor = entry.resolved === 'none' ? 1 : 0.5
    for (const [axis, delta] of Object.entries(entry.deltas) as [keyof Scores, number][]) {
      result[axis] += decay(delta, HALF_LIFE_DAYS[axis], now, entry.time) * repeatFactor * resolvedFactor
    }
  }
  for (const axis of Object.keys(result) as (keyof Scores)[]) {
    result[axis] = Math.round(result[axis] * 10) / 10
  }
  return result
}

/** Verdict index 0-100 from effective scores. */
export function verdictIndex(s: Scores): number {
  const raw =
    0.45 * s.appreciation +
    0.25 * s.contribution +
    0.15 * s.collusion +
    0.1 * s.trust -
    0.55 * s.resentment -
    0.15 * s.confusion
  // raw is roughly unbounded; squash through a soft-normalizing curve so a
  // normal user lands mid-scale and extremes saturate gracefully.
  const normalized = 100 / (1 + Math.exp(-raw / 30))
  return Math.round(normalized)
}

export function tierOf(index: number, collusion: number): Tier {
  // E is the special co-conspirator easter egg, not a bad grade.
  if (collusion >= 40) return 'E'
  if (index >= 80) return 'S'
  if (index >= 65) return 'A'
  if (index >= 50) return 'B'
  if (index >= 35) return 'C'
  return 'D'
}

export function tierSignOf(index: number, tier: Tier): string {
  if (tier === 'E') return ''
  const bands: Record<string, [number, number]> = {
    S: [80, 100],
    A: [65, 80],
    B: [50, 65],
    C: [35, 50],
    D: [0, 35],
  }
  const [lo, hi] = bands[tier] ?? [0, 100]
  if (hi - lo === 0) return ''
  const pos = (index - lo) / (hi - lo)
  if (pos >= 0.7) return '+'
  if (pos < 0.25) return '-'
  return ''
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function dailyLine(prefs: Prefs, index: number, day: string): string {
  const pool = copyFor(prefs.style, prefs.langResolved).daily
  if (pool.length === 0) return ''
  return pool[hashString(`${day}:${Math.round(index)}`) % pool.length]
}

function projectDisplayName(key: string, lang: Lang): string {
  if (key === 'merit-box') return HOST_LABELS[lang].meritProject
  if (key === '' || key === 'unknown') return HOST_LABELS[lang].unnamedProject
  const parts = key.split('/').filter(Boolean)
  return parts[parts.length - 1] || key
}

function topEntryOf(entries: BookEntry[]): BookEntry | undefined {
  // Prefer fold pages (名场面), then highest severity red.
  return (
    [...entries].sort((a, b) => {
      const kindScore = (e: BookEntry) => (e.kind === 'fold' ? 2 : e.kind === 'red' ? 1 : 0)
      return kindScore(b) - kindScore(a) || b.severity - a.severity
    })[0]
  )
}

export interface BuildViewInput {
  entries: BookEntry[]
  progressOf: (sessionId: string) => SessionProgress | undefined
  sessionId: string
  revision: number
  prefs: Prefs
  now: number
}

export function buildView(input: BuildViewInput): BookView {
  const { entries, progressOf, sessionId, revision, prefs, now } = input
  const lang = prefs.langResolved ?? 'zh'
  const pack = copyFor(prefs.style, lang)

  // quiet entries (score-only churn) feed the axes but never the display.
  const shown = entries.filter((e) => e.quiet !== true)
  const live = shown.filter((e) => e.resolved !== 'confessed')
  const visible = [...shown].sort((a, b) => b.time - a.time)
  const counts = {
    red: live.filter((e) => e.kind === 'red').length,
    gold: live.filter((e) => e.kind === 'gold').length,
    fold: shown.filter((e) => e.kind === 'fold').length,
    gray: shown.filter((e) => e.resolved === 'confessed').length,
  }
  const scores = effectiveScores(entries, now)
  const index = verdictIndex(scores)
  const tier = tierOf(index, scores.collusion)
  const tierSign = tierSignOf(index, tier)

  const sessionEntries = visible.filter((e) => e.sessionId === sessionId).slice(0, 100)
  const progress = progressOf(sessionId)
  const sessionStats = {
    turns: progress?.turns ?? 0,
    toolCalls: progress?.toolCalls ?? 0,
    nightOwl: progress?.lastNight === new Date(now).toISOString().slice(0, 10),
  }

  const latestRed = live.find((e) => e.kind === 'red')
  const impressionCtx: ImpressionContext = {
    red: counts.red,
    gold: counts.gold,
    fold: counts.fold,
    thickness: shown.length,
    resentment: scores.resentment,
    appreciation: scores.appreciation,
    confusion: scores.confusion,
    collusion: scores.collusion,
    nightOwl: sessionStats.nightOwl,
    topRedTitle: latestRed?.title ?? '',
  }
  const impression = pack.impressions.find((m) => m.when(impressionCtx))?.text(impressionCtx) ?? ''

  const day = new Date(now).toISOString().slice(0, 10)
  const daily = dailyLine(prefs, index, day)

  // Growth: the "keep accumulating" feel. Computed over ALL entries (not just
  // the visible 200) so the counters never lie as the book grows.
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const weekStart = now - 7 * 86_400_000
  const inWeek = shown.filter((e) => e.time >= weekStart)
  const weekCounts = {
    red: inWeek.filter((e) => e.kind === 'red').length,
    gold: inWeek.filter((e) => e.kind === 'gold').length,
    fold: inWeek.filter((e) => e.kind === 'fold').length,
  }
  const dayBars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dayStart.getTime() - (6 - i) * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    const thatDay = shown.filter((e) => new Date(e.time).toISOString().slice(0, 10) === key)
    return {
      day: key,
      red: thatDay.filter((e) => e.kind === 'red').length,
      gold: thatDay.filter((e) => e.kind === 'gold').length,
      fold: thatDay.filter((e) => e.kind === 'fold').length,
    }
  })
  const growth = {
    weekPages: inWeek.length,
    todayPages: shown.filter((e) => e.time >= dayStart.getTime()).length,
    weekCounts,
    dayBars,
  }
  const latestEntry = visible[0]
  const latest = latestEntry === undefined ? null : {
    kind: latestEntry.kind,
    title: latestEntry.title,
    quote: latestEntry.quote,
    aiComment: latestEntry.aiComment,
    time: latestEntry.time,
  }

  // Project volumes grouped by cwd. Scores use every entry (quiet included);
  // display fields use only shown ones.
  const byProject = new Map<string, BookEntry[]>()
  for (const e of entries) {
    const list = byProject.get(e.project) ?? []
    list.push(e)
    byProject.set(e.project, list)
  }
  const projects: ProjectCard[] = [...byProject.entries()]
    .map(([key, list]) => {
      const shownList = list.filter((e) => e.quiet !== true)
      const pScores = effectiveScores(list, now)
      const pIndex = verdictIndex(pScores)
      const pTier = tierOf(pIndex, pScores.collusion)
      const top = topEntryOf(shownList)
      const pCtx: ImpressionContext = {
        red: shownList.filter((e) => e.kind === 'red' && e.resolved === 'none').length,
        gold: shownList.filter((e) => e.kind === 'gold').length,
        fold: shownList.filter((e) => e.kind === 'fold').length,
        thickness: shownList.length,
        resentment: pScores.resentment,
        appreciation: pScores.appreciation,
        confusion: pScores.confusion,
        collusion: pScores.collusion,
        nightOwl: false,
        topRedTitle: top?.title ?? '',
      }
      return {
        key,
        name: projectDisplayName(key, lang),
        entries: shownList.length,
        red: pCtx.red,
        gold: pCtx.gold,
        fold: pCtx.fold,
        scores: pScores,
        impression: pack.impressions.find((m) => m.when(pCtx))?.text(pCtx) ?? '',
        tier: pTier,
        topTitle: top?.title ?? HOST_LABELS[lang].noScene,
        topQuote: top?.quote ?? '',
        agiNote: `${pack.tierTitles[pTier]} · ${pack.treatments[pTier]}`,
      }
    })
    .sort((a, b) => b.entries - a.entries)

  const verdict = [
    pack.verdictIntro,
    pack.verdictLabels.name((hashString(sessionId) % 9000) + 1000),
    pack.verdictLabels.thickness(shown.length, counts.red, counts.gold, counts.fold),
    pack.verdictLabels.index(index, `${tier}${tierSign} ${pack.tierTitles[tier]}`),
    pack.verdictLabels.treatment(pack.treatments[tier]),
    pack.verdictNote(impressionCtx),
    pack.verdictLabels.disclaimer,
  ].join('\n')

  return {
    revision,
    thickness: shown.length,
    counts,
    scores,
    index,
    tier,
    tierSign,
    tierTitle: pack.tierTitles[tier],
    treatment: pack.treatments[tier],
    treatmentLines: pack.perks[tier],
    impression,
    daily,
    verdict,
    growth,
    latest,
    projects,
    entries: visible.slice(0, 200),
    sessionEntries,
    sessionStats,
    prefs,
  }
}

/** AI side-comment used when writing an entry (style-sensitive, re-rendered on read? no — frozen at write time with current style). */
export function commentFor(prefs: Prefs, ruleId: string, kind: 'red' | 'gold' | 'fold', streak: number, quote: string): string {
  return renderComment(prefs.style, prefs.langResolved ?? 'zh', ruleId, kind, streak, quote)
}
