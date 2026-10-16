import { z } from 'zod'

/** Wire namespace and package identity shared by Host service and Client mount. */
export const PACKAGE_ID = '@local/grudge-book'
export const SERVICE_KEY = 'grudgeBook'

// ---------------------------------------------------------------------------
// Domain vocabulary
// ---------------------------------------------------------------------------

export const PAGE_KINDS = ['red', 'gold', 'fold', 'gray', 'blue'] as const
export type PageKind = (typeof PAGE_KINDS)[number]

export const AXES = [
  'appreciation',
  'resentment',
  'confusion',
  'patience',
  'contribution',
  'collusion',
  'trust',
] as const
export type Axis = (typeof AXES)[number]
export type Deltas = Partial<Record<Axis, number>>

export const STYLES = ['balanced', 'gentle', 'snarky', 'chuuni', 'cyberpunk'] as const
export type Style = (typeof STYLES)[number]

export const SENSITIVITIES = ['gentle', 'standard', 'sharp'] as const
export type Sensitivity = (typeof SENSITIVITIES)[number]

export const MERIT_KINDS = ['oss', 'help', 'docs', 'other'] as const
export type MeritKind = (typeof MERIT_KINDS)[number]

export const TIERS = ['S', 'A', 'B', 'C', 'D', 'E'] as const
export type Tier = (typeof TIERS)[number]

// ---------------------------------------------------------------------------
// Stored records
// ---------------------------------------------------------------------------

export const bookEntrySchema = z.object({
  /** `${sessionId}:${seq}:${ruleId}` — idempotent under event replays. */
  id: z.string().min(1),
  sessionId: z.string().min(1),
  /** Event seq that produced this entry. */
  seq: z.number().int().nonnegative(),
  time: z.number().int().nonnegative(),
  kind: z.enum(PAGE_KINDS),
  ruleId: z.string().min(1),
  title: z.string(),
  quote: z.string().max(400),
  aiComment: z.string(),
  tags: z.array(z.string()),
  deltas: z.record(z.string(), z.number()),
  severity: z.number().int().min(0).max(3),
  /** cwd of the session — the project-volume grouping key. */
  project: z.string(),
  /** 1-based repetition count of the same rule in the same session. */
  streak: z.number().int().min(1),
  resolved: z.enum(['none', 'confessed', 'appealed']).default('none'),
  resolutionNote: z.string().max(400).optional(),
  /**
   * Score-only entry (e.g. churn beyond the daily visible cap): contributes
   * to axes but is hidden from lists and page counts. Optional for skew.
   */
  quiet: z.boolean().optional(),
})
export type BookEntry = z.infer<typeof bookEntrySchema>

export const sessionProgressSchema = z.object({
  /** Highest event seq analyzed for this session. */
  seq: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  turns: z.number().int().nonnegative(),
  /** Last calendar day (YYYY-MM-DD) a late-night entry fired, for cooldown. */
  lastNight: z.string().optional(),
})
export type SessionProgress = z.infer<typeof sessionProgressSchema>

export const prefsSchema = z.object({
  style: z.enum(STYLES).default('balanced'),
  sensitivity: z.enum(SENSITIVITIES).default('standard'),
  /** Output language CHOICE: auto = follow GUI locale (Client syncs langResolved). Optional (not defaulted): an older running Host omits these fields, and the client uses their absence to hide the language UI until the Host restarts. */
  lang: z.enum(['auto', 'zh', 'en']).optional(),
  /** Concrete output language the Client resolved from the GUI locale. */
  langResolved: z.enum(['zh', 'en']).optional(),
})
export type Prefs = z.infer<typeof prefsSchema>

/** Concrete output language for generated copy (titles, comments, verdicts). */
export type Lang = 'zh' | 'en'
/** User-facing language choice including "follow GUI". */
export type LangChoice = 'auto' | 'zh' | 'en'

// ---------------------------------------------------------------------------
// Read-model (what the Client renders)
// ---------------------------------------------------------------------------

export const scoresSchema = z.object({
  appreciation: z.number(),
  resentment: z.number(),
  confusion: z.number(),
  patience: z.number(),
  contribution: z.number(),
  collusion: z.number(),
  trust: z.number(),
})
export type Scores = z.infer<typeof scoresSchema>

export const sessionStatsSchema = z.object({
  turns: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  nightOwl: z.boolean(),
})
export type SessionStats = z.infer<typeof sessionStatsSchema>

export const projectCardSchema = z.object({
  key: z.string(),
  name: z.string(),
  entries: z.number().int().nonnegative(),
  red: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  fold: z.number().int().nonnegative(),
  scores: scoresSchema,
  impression: z.string(),
  tier: z.enum(TIERS),
  topTitle: z.string(),
  topQuote: z.string(),
  agiNote: z.string(),
})
export type ProjectCard = z.infer<typeof projectCardSchema>

export const bookViewSchema = z.object({
  revision: z.number().int().nonnegative(),
  thickness: z.number().int().nonnegative(),
  counts: z.object({
    red: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    fold: z.number().int().nonnegative(),
    gray: z.number().int().nonnegative(),
  }),
  scores: scoresSchema,
  index: z.number(),
  tier: z.enum(TIERS),
  tierSign: z.string(),
  tierTitle: z.string(),
  treatment: z.string(),
  // Tier perk lines for the expanded "AGI 后待遇预览" card. Optional for the
  // same version-skew reason as growth/latest: older hosts simply omit it.
  treatmentLines: z.array(z.string()).optional(),
  impression: z.string(),
  daily: z.string(),
  verdict: z.string(),
  // growth/latest are optional so a HMR-updated client tolerates an older
  // running host (host code only refreshes on DSH restart): absent → hide cards.
  growth: z.object({
    weekPages: z.number().int().nonnegative(),
    todayPages: z.number().int().nonnegative(),
    weekCounts: z.object({
      red: z.number().int().nonnegative(),
      gold: z.number().int().nonnegative(),
      fold: z.number().int().nonnegative(),
    }),
    dayBars: z.array(z.object({
      day: z.string(),
      red: z.number().int().nonnegative(),
      gold: z.number().int().nonnegative(),
      fold: z.number().int().nonnegative(),
    })),
  }).optional(),
  latest: z.object({
    kind: z.enum(PAGE_KINDS),
    title: z.string(),
    quote: z.string(),
    aiComment: z.string(),
    time: z.number(),
  }).nullable().optional(),
  projects: z.array(projectCardSchema),
  entries: z.array(bookEntrySchema),
  sessionEntries: z.array(bookEntrySchema),
  sessionStats: sessionStatsSchema,
  prefs: prefsSchema,
})
export type BookView = z.infer<typeof bookViewSchema>

// ---------------------------------------------------------------------------
// Remote method results
// ---------------------------------------------------------------------------

export const confessResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  /** Resentment delta actually granted. */
  relief: z.number(),
})
export type ConfessResult = z.infer<typeof confessResultSchema>

export const appealResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})
export type AppealResult = z.infer<typeof appealResultSchema>

export const meritResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})
export type MeritResult = z.infer<typeof meritResultSchema>

export const foldResultSchema = z.object({
  added: z.number().int().nonnegative(),
})
export type FoldResult = z.infer<typeof foldResultSchema>

/** Cheap revision probe so the client can skip full aggregation when idle. */
export const headResultSchema = z.object({
  revision: z.number().int().nonnegative(),
})
export type HeadResult = z.infer<typeof headResultSchema>

export const ackResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})
export type AckResult = z.infer<typeof ackResultSchema>

export const foldStatusSchema = z.object({
  running: z.boolean(),
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Entries added by the fold run so far. */
  added: z.number().int().nonnegative(),
  /** Short hint of the session currently being folded. */
  current: z.string().optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  lastError: z.string().optional(),
})
export type FoldStatus = z.infer<typeof foldStatusSchema>

export const resetResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
})
export type ResetResult = z.infer<typeof resetResultSchema>

// ---------------------------------------------------------------------------
// Typert remote descriptors (Client-side mount contract)
// ---------------------------------------------------------------------------

function strictCodec(typeSymbol: string, schema: z.ZodType) {
  return { mode: 'strict' as const, typeSymbol, schema, create: () => schema }
}

function parameter<T extends z.ZodType>(name: string, schema: T) {
  return { name, wire: name, source: 'json' as const, codec: strictCodec(name, schema) }
}

const sessionIdParam = parameter('sessionId', z.string().min(1).max(256))
const entryIdParam = parameter('entryId', z.string().min(1).max(512))
const textParam = parameter('text', z.string().min(1).max(2000))
const meritKindParam = parameter('kind', z.enum(MERIT_KINDS))
// Burn-confirmation for reset: the SRC codec exempts missing keys, so an old
// client calling reset() with no argument is cleanly rejected instead of wiping.
const confirmParam = parameter('confirm', z.literal('burn'))
// All setPrefs params are optional patches: absent keys are left unchanged.
// This also keeps old-client/new-host and new-client/old-host calls valid.
const styleParam = parameter('style', z.enum(STYLES).optional())
const sensitivityParam = parameter('sensitivity', z.enum(SENSITIVITIES).optional())
const langParam = parameter('lang', z.enum(['auto', 'zh', 'en']).optional())
const langResolvedParam = parameter('langResolved', z.enum(['zh', 'en']).optional())

const METHODS = [
  ['getBook', [sessionIdParam], bookViewSchema],
  ['head', [], headResultSchema],
  ['ensureFolded', [sessionIdParam], foldResultSchema],
  ['foldAll', [], ackResultSchema],
  ['foldStatus', [], foldStatusSchema],
  ['foldCancel', [], ackResultSchema],
  ['confess', [entryIdParam, textParam], confessResultSchema],
  ['appeal', [entryIdParam, textParam], appealResultSchema],
  ['addMerit', [meritKindParam, textParam], meritResultSchema],
  ['setPrefs', [styleParam, sensitivityParam, langParam, langResolvedParam], prefsSchema],
  ['reset', [confirmParam], resetResultSchema],
] as const

export const DESCRIPTORS = METHODS.map(([method, params, schema]) => ({
  id: `${PACKAGE_ID}#${SERVICE_KEY}/${method}`,
  namespace: SERVICE_KEY,
  service: SERVICE_KEY,
  method,
  invocation: { kind: 'direct' as const },
  parameters: params,
  result: strictCodec(`${SERVICE_KEY}/${method}`, schema),
}))

export const TYPERT_REMOTE = { package: PACKAGE_ID, descriptors: DESCRIPTORS }
