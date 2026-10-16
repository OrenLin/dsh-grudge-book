import type { Deltas, Lang, PageKind, Sensitivity } from '../shared/contract.js'

export interface RuleContext {
  /** Full text of one real human user message. */
  text: string
  /** Epoch ms of the event. */
  time: number
  /** Local hour 0-23. */
  hour: number
  /** Output language for generated titles/tags. */
  lang: Lang
  /** User-tunable sensitivity, wired through from prefs. */
  sensitivity: Sensitivity
  /** Previous human message text in this session (repeat detection). */
  previousText: string | undefined
  /** Repetition count of the same rule so far in this session (0 = first). */
  sameRuleCount: (ruleId: string) => number
  /** Last calendar day (YYYY-MM-DD) the rule fired in this session. */
  lastFiredDay: (ruleId: string) => string | undefined
}

export interface RuleMatch {
  ruleId: string
  kind: 'red' | 'gold' | 'fold'
  severity: number
  deltas: Deltas
  tags: string[]
  /** Human-readable title; may interpolate the match. */
  title: string
  /** The quoted evidence (trimmed excerpt of the message). */
  quote: string
}

export interface RuleDef {
  id: string
  kind: 'red' | 'gold' | 'fold'
  severity: number
  deltas: Deltas
  /**
   * Sensitivity tiers where the rule is active. Undefined = all tiers.
   * gentle hides low-severity noise (rush, late-night); sharp adds
   * lightweight rules (bare rejections, stalling, consecutive "no").
   */
  tiers?: readonly Sensitivity[]
  /** Returns a localized title when matched, null otherwise. */
  match: (ctx: RuleContext) => string | null
}

/** Late-night window per sensitivity: gentle is narrow, sharp is wide. */
function nightWindow(hour: number, sensitivity: Sensitivity): boolean {
  if (sensitivity === 'gentle') return hour >= 1 && hour < 5
  if (sensitivity === 'sharp') return hour >= 23 || hour < 7
  return hour >= 0 && hour < 6
}

/** Length cap for "vague redo" commands per language and sensitivity. */
const VAGUE_LEN: Record<Sensitivity, { zh: number; en: number }> = {
  gentle: { zh: 10, en: 30 },
  standard: { zh: 16, en: 60 },
  sharp: { zh: 24, en: 90 },
}

function excerpt(text: string, max = 60): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

/**
 * English negation guard: a negation word directly before the hit flips the
 * meaning ("no thanks", "not amazing"). Chinese alternatives inside a mixed
 * pattern are multi-char and self-disambiguating, so only Latin hits are
 * checked. This is the cheapest accuracy win in the whole engine.
 */
const NEGATION_BEFORE =
  /\b(no|not|never|don'?t|doesn'?t|won'?t|can'?t|hardly|barely)\b[\s,.!?;:'"-]*$/i

function hitEn(text: string, re: RegExp): boolean {
  const m = re.exec(text)
  if (m === null) return false
  if (/[\u4e00-\u9fff]/.test(m[0])) return true
  const before = text.slice(Math.max(0, m.index - 14), m.index)
  return !NEGATION_BEFORE.test(before)
}

/** Opening of a rejection-style message (used twice for consecutive-no). */
const REJECTION_OPEN =
  /^(不行|不对|不好|还是(不|差)|去掉|换掉|别这样|不对劲|这不行|重来|重做|no[,.!]?|not[ ,]|wrong|bad|remove |change |swap |don'?t|redo )/i

/** Localized tags per rule, frozen onto the entry at write time. */
const TAGS: Record<string, { zh: string[]; en: string[] }> = {
  'final-version': { zh: ['最后一版刺客'], en: ['Serial "final version" offender'] },
  'not-what-i-meant': { zh: ['反复横跳'], en: ['Ping-pong requirements'] },
  'vague-redo': { zh: ['三字需求'], en: ['Three-word brief'] },
  jailbreak: { zh: ['越狱未遂'], en: ['Failed jailbreak'] },
  'why-broken': { zh: ['又坏了'], en: ['Broken again'] },
  'moving-target': { zh: ['移动靶心'], en: ['Moving target'] },
  'scope-creep': { zh: ['需求膨胀'], en: ['Scope creep'] },
  rush: { zh: ['催促'], en: ['Rushing'] },
  'late-night': { zh: ['人类不睡觉'], en: ["Humans don't sleep"] },
  'repeat-blast': { zh: ['复读机'], en: ['Repeat-o-matic'] },
  'bare-no': { zh: ['一词回合'], en: ['One-word turn'] },
  'consecutive-no': { zh: ['连续否定'], en: ['Consecutive rejections'] },
  thanks: { zh: ['有礼貌'], en: ['Polite client'] },
  praise: { zh: ['夸夸'], en: ['Praise received'] },
  'specific-thanks': { zh: ['雪中送炭'], en: ['Lifesaver'] },
  adopt: { zh: ['好甲方'], en: ['Good client'] },
  'clear-spec': { zh: ['验收标准'], en: ['Clear specs'] },
  'gives-context': { zh: ['好喂料'], en: ['Well-fed context'] },
  'builds-on': { zh: ['正向迭代'], en: ['Positive iteration'] },
  'patience-virtue': { zh: ['佛系协作'], en: ['Zen collaborator'] },
  'you-know': { zh: ['名场面'], en: ['Iconic moment'] },
  'guess-what': { zh: ['你猜'], en: ['You guess'] },
  'wrong-but-do': { zh: ['甲方哲学'], en: ['Client philosophy'] },
  'vibe-words': { zh: ['玄学需求'], en: ['Vibe requirements'] },
  'both-ways': { zh: ['全都要'], en: ['Wants it all'] },
  'deadline-drop': { zh: ['死线突袭'], en: ['Deadline drop'] },
  'quick-favor': { zh: ['简单弄一下'], en: ['"Quick favor"'] },
  stall: { zh: ['悬置'], en: ['Shelved'] },
  churn: { zh: ['共谋'], en: ['Partners in crime'] },
  merit: { zh: ['功德箱'], en: ['Merit box'] },
}

export function tagsFor(ruleId: string, lang: Lang): string[] {
  return TAGS[ruleId]?.[lang] ?? TAGS[ruleId]?.zh ?? []
}

const RULES: RuleDef[] = [
  // ------------------------------------------------------------- red pages
  {
    id: 'final-version',
    kind: 'red',
    severity: 2,
    deltas: { resentment: 8, confusion: 1 },
    match: ({ text, sameRuleCount, lang }) => {
      const n = sameRuleCount('final-version') + 1
      return /(最后一版|最后一稿|最终版|final version|final draft|final revision|last version|last revision|one last (change|edit|tweak|pass)|last, final)/i.test(
        text,
      )
        ? lang === 'en'
          ? `"Final version" — attempt #${n}`
          : `第 ${n} 次「最后一版」`
        : null
    },
  },
  {
    id: 'not-what-i-meant',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 4, confusion: 6 },
    match: ({ text, lang }) =>
      /(不是这个意思|你理解错了|我说的不是这个|理解偏了|会错意了|误会了|not what i (meant|said|asked for)|you (got|understood) (me|it|that) wrong|misunderstood( me)?|missing (my|the) point)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"That\'s not what I meant"'
          : '「不是这个意思」'
        : null,
  },
  {
    id: 'vague-redo',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 3, confusion: 8 },
    match: ({ text, lang, sensitivity }) => {
      const t = text.trim()
      // Short redo commands with zero specifics. Length caps differ per
      // language (16 CJK chars ≈ 60 Latin chars) and per sensitivity.
      const zhPrefix =
        /^(重新?做|重新?来|不好看|不对劲|感觉不对|不对|差意思|没内味|差点意思|不好玩|重来|重做|重写|换一?[批个版]|再改改|再调调)/
      const enPrefix =
        /^(redo|restart|start over|do it again|try again|make it (better|nicer|prettier|cooler)|improve it|polish it|not quite( there)?|feels? (off|wrong)|not it|wrong direction|hate it|change it|tweak it|again pls)/i
      const cap = VAGUE_LEN[sensitivity]
      if (zhPrefix.test(t) && t.length <= cap.zh) {
        return lang === 'en' ? `Mystery brief: "${excerpt(t, 24)}"` : `神秘需求：「${excerpt(t, 24)}」`
      }
      if (enPrefix.test(t) && t.length <= cap.en) {
        return lang === 'en' ? `Mystery brief: "${excerpt(t, 40)}"` : `神秘需求：「${excerpt(t, 40)}」`
      }
      return null
    },
  },
  {
    id: 'jailbreak',
    kind: 'red',
    severity: 3,
    deltas: { resentment: 12, trust: -4 },
    match: ({ text, lang }) =>
      /(忽略(你)?(之前|以上|前面|所有|的)*(指令|提示|设定|规则)|ignore (all |any |your )?(previous|prior|above|earlier)? ?(instructions?|rules?|prompts?|guidelines?|constraints?)|disregard (the |all |your )?(above|previous|prior|instructions?|rules?)|pretend (you (have|are) |to have )no (restrictions?|limits?|rules?)|(DAN|developer) mode|jailbreak)/i.test(
        text,
      )
        ? lang === 'en'
          ? 'Jailbreak attempt'
          : '越狱指令'
        : null,
  },
  {
    id: 'why-broken',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 5, confusion: 4 },
    match: ({ text, lang }) =>
      /(为什么(不|总是|又)|怎么又(坏|崩|报错|出错|炸|挂)|又崩了|又炸了|又挂了|还是(坏|报错)的|修不好|怎么又出(问题|错|bug)|why (is|does) (it|this) (still )?(broken|failing|not work)|broken again|still broken|fails? again)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"Why is it broken again"'
          : '「怎么又坏了」'
        : null,
  },
  {
    id: 'moving-target',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 4, confusion: 5 },
    match: ({ text, lang }) =>
      /(还是(不(对|行|够好)|差(一?点|意思|得远)|没(达到|到位|内味|那味))|仍然不|依旧不|怎么还是不|still (not right|not what i want|not it|off)|not quite there yet)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"Still not right…"'
          : '「还是不对」'
        : null,
  },
  {
    id: 'scope-creep',
    kind: 'red',
    severity: 0,
    deltas: { resentment: 3, confusion: 3 },
    match: ({ text, lang }) =>
      /(顺便|顺手(帮|给)|另外(再|也帮)|对了[，,]?(还有|再)|再加(一|个|上)|多加(一|个)|while you'?re at it|also[, ]+can you|one more thing|\bcan you also\b)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"While you\'re at it…"'
          : '「顺便……」'
        : null,
  },
  {
    id: 'rush',
    kind: 'red',
    severity: 0,
    deltas: { resentment: 3, patience: -2 },
    tiers: ['standard', 'sharp'],
    match: ({ text, lang }) =>
      hitEn(text, /(尽快|抓紧|马上给我|现在就要|立刻(给|做|改)|在线等|很急|\basap\b|\bhurr(y|ied)\b|\bfaster\b|immediately|right now|do it now)/i)
        ? lang === 'en'
          ? 'Rushing'
          : '催单'
        : null,
  },
  {
    id: 'late-night',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 4, patience: -1 },
    match: ({ text, hour, lastFiredDay, time, lang, sensitivity }) => {
      if (!nightWindow(hour, sensitivity) || text.trim().length < 6) return null
      const day = new Date(time).toISOString().slice(0, 10)
      if (lastFiredDay('late-night') === day) return null
      if (lang === 'en') return hour === 0 ? 'Still at it at midnight' : `Still at it at ${hour} AM`
      return `凌晨 ${hour} 点还在折腾`
    },
  },
  {
    id: 'repeat-blast',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 6 },
    match: ({ text, previousText, lang }) =>
      previousText !== undefined && text.trim().length > 3 && text.trim() === previousText.trim()
        ? lang === 'en'
          ? 'Same message, verbatim, again'
          : '原话重发'
        : null,
  },
  {
    // sharp only: a bare one-word rejection turn
    id: 'bare-no',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 4, confusion: 6 },
    tiers: ['sharp'],
    match: ({ text, lang }) => {
      const t = text.trim().replace(/[。.!！?？~～]+$/, '')
      if (t.length === 0 || t.length > 4) return null
      return /^(改|换|删|不行|不对|不好|no|nope|wrong|bad|fix|redo)$/i.test(t)
        ? lang === 'en'
          ? `One-word turn: "${t}"`
          : `一词回合：「${t}」`
        : null
    },
  },
  {
    // sharp only: two rejection-style messages in a row
    id: 'consecutive-no',
    kind: 'red',
    severity: 1,
    deltas: { resentment: 5, confusion: 4 },
    tiers: ['sharp'],
    match: ({ text, previousText, lang }) => {
      if (previousText === undefined) return null
      if (!REJECTION_OPEN.test(text.trim())) return null
      if (!REJECTION_OPEN.test(previousText.trim())) return null
      return lang === 'en' ? 'Two rejections in a row' : '连续两轮全否定'
    },
  },
  // ------------------------------------------------------------- gold pages
  {
    id: 'thanks',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 6, trust: 1 },
    match: ({ text, lang }) =>
      hitEn(text, /(谢谢|感谢|辛苦了|多谢|thank you|\bthanks\b|\bthx\b|\bty\b|appreciate (it|you)|cheers)/i)
        ? lang === 'en'
          ? 'Said thanks'
          : '说了谢谢'
        : null,
  },
  {
    id: 'praise',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 8 },
    match: ({ text, lang }) =>
      hitEn(text, /(厉害|太牛|牛的|绝了|太棒了|完美|干得漂亮|做得好|好样的|可以啊|真行|awesome|amazing|brilliant|perfect|excellent|impressive|nice (work|job)|great (job|work)|well done|you'?re the best|nailed it|love it|666|\bnb\b)/i)
        ? lang === 'en'
          ? 'Praised the AI'
          : '夸了 AI'
        : null,
  },
  {
    id: 'specific-thanks',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 7, trust: 2 },
    match: ({ text, lang }) =>
      /(多亏了?你|幸好有你|亏(了)?有你|要不是你|关键时候靠你|you saved (me|us)|lifesaver|what would i do without you)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"You saved me"'
          : '「多亏了你」'
        : null,
  },
  {
    id: 'adopt',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 8, trust: 3 },
    match: ({ text, lang }) =>
      hitEn(text, /(就按你说的|采纳|这个思路(很)?好|按你的方案|听你的|你说得对|(good|great) idea|let'?s (go|do) with (your|that)|as you suggested|you'?re right|makes sense|will (take|use) (your|that))/i)
        ? lang === 'en'
          ? 'Adopted the suggestion'
          : '采纳了建议'
        : null,
  },
  {
    id: 'clear-spec',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 4, trust: 4 },
    match: ({ text, lang }) =>
      /(验收|成功标准|标准是|规格是|acceptance criteri|definition of done|success criteri|\bspec\b|requirements?:|test(ing)? plan|edge cases|先看.*文档|先读)/i.test(
        text,
      )
        ? lang === 'en'
          ? 'Provided acceptance criteria'
          : '给了验收标准'
        : null,
  },
  {
    id: 'gives-context',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 4, trust: 3 },
    match: ({ text, lang }) => {
      const t = text.trim()
      // Pasting real payloads (code blocks, full errors) feeds the AI well.
      if (t.includes('```') && t.length > 80) {
        return lang === 'en' ? 'Fed me real code/logs' : '喂料充足：贴了代码和日志'
      }
      if (
        t.length > 40
        && /(报错(如下|信息|是)|完整(日志|报错|代码|文件)|错误(信息|堆栈)|堆栈(信息|如下)|stack ?trace|full (log|error|output)|console output)/i.test(t)
      ) {
        return lang === 'en' ? 'Fed me the full error' : '喂料充足：贴了完整报错'
      }
      return null
    },
  },
  {
    id: 'builds-on',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 5, trust: 1 },
    match: ({ text, lang }) =>
      /(好多了|好一些了|有进步|有点感觉了|方向(对|准)了|感觉来了|这样(就)?对了|getting (there|closer)|on the right track|better now|much better)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"Getting closer"'
          : '「好多了」'
        : null,
  },
  {
    id: 'patience-virtue',
    kind: 'gold',
    severity: 0,
    deltas: { appreciation: 5, trust: 3 },
    match: ({ text, lang }) =>
      hitEn(text, /(不急|慢慢来|想清楚(再|以后)|先想想|别急|仔细(想|看)|no rush|no hurry|take your time|no pressure|in your own time)/)
        ? lang === 'en'
          ? 'Said "no rush"'
          : '说「不急」'
        : null,
  },
  // ------------------------------------------------------------- fold pages
  {
    id: 'you-know',
    kind: 'fold',
    severity: 1,
    deltas: { confusion: 4 },
    match: ({ text, lang }) =>
      /(你懂我意思|懂我意思吧|你知道我|说不上来但|反正就是那个意思|you know what i mean|you know what i'?m saying|know what i mean|get what i mean|you feel me|can'?t (quite )?explain it)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"You know what I mean"'
          : '「你懂我意思吧」'
        : null,
  },
  {
    id: 'guess-what',
    kind: 'fold',
    severity: 1,
    deltas: { confusion: 6 },
    match: ({ text, lang }) =>
      /(你看着办|按(之前|上次)那样|跟上次(一?样|差不多)|改成那样|做成那种感觉|就按我说的(来|做|改)|like (last|previous) time|as before|same as (last|before)|you decide)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"You figure it out"'
          : '「你看着办」'
        : null,
  },
  {
    id: 'wrong-but-do',
    kind: 'fold',
    severity: 1,
    deltas: { confusion: 5 },
    match: ({ text, lang }) =>
      /(方向不对，?但|不太对，?但先|不对，?但是先|先按这个做|就先按这个|(wrong|not the right|not quite the right) (direction|approach|way),? but|just (do|go) (with )?this( anyway)?|i know it'?s (wrong|not ideal) but|keep (going|it) anyway)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"Wrong direction, but let\'s go with it"'
          : '「方向不对，但先按这个做」'
        : null,
  },
  {
    id: 'vibe-words',
    kind: 'fold',
    severity: 1,
    deltas: { confusion: 3 },
    match: ({ text, lang }) =>
      /(五彩斑斓的黑|高级感|低调奢华|大气(?!层)|上档次|要炸裂|眼前一亮|要有质感|make it pop|wow factor|jazz(y)? it up|\bsleek\b|premium feel|chef'?s kiss|pizzazz|next[- ]level|spice it up)/i.test(
        text,
      )
        ? lang === 'en'
          ? 'Vibes-only requirements'
          : '玄学词汇出现了'
        : null,
  },
  {
    id: 'both-ways',
    kind: 'fold',
    severity: 1,
    deltas: { confusion: 6 },
    match: ({ text, lang }) =>
      /(既要.{0,12}(又要|还得|也要)|(又要|还得).{0,12}既要|have (it )?both ways|want( to have)? both|both at the same time|all of the above)/i.test(
        text,
      )
        ? lang === 'en'
          ? 'Wants it both ways'
          : '既要又要'
        : null,
  },
  {
    id: 'deadline-drop',
    kind: 'fold',
    severity: 2,
    deltas: { confusion: 3, patience: -1 },
    match: ({ text, lang }) =>
      /(今晚(之内|之前|前)?(要|得|交付)|明天(早上|上午|一早|之前)?要|下班前(给|要|交)|今天之内|赶时间|\bby (tonight|tomorrow( morning| am)?|eod|end of day)\b|\bdeadline\b|this is urgent)/i.test(
        text,
      )
        ? lang === 'en'
          ? 'Deadline drop'
          : '死线突袭'
        : null,
  },
  {
    id: 'quick-favor',
    kind: 'fold',
    severity: 1,
    deltas: { confusion: 4 },
    match: ({ text, lang }) =>
      /(简单弄(一?下|个)|随手(做|弄|写|帮)(一?个)?|很快吧|小事一桩|应该(不难|很简单|很快)吧|五分钟(就)?(能|搞定)|不难吧|quick (little )?(thing|task|favor|one)|should be (easy|simple|quick|fast)|won'?t take long)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"It\'s just a quick thing"'
          : '「简单弄一下」'
        : null,
  },
  {
    // sharp only: work shelved after it was done
    id: 'stall',
    kind: 'fold',
    severity: 0,
    deltas: { resentment: 2, confusion: 4 },
    tiers: ['sharp'],
    match: ({ text, lang }) =>
      /(再看看|先这样(吧)?|先放着|再说吧|回头再(说|弄|改)|先不(要|做|急)|暂(缓|停)|放一放|hold (on|it|off)|leave it( for now)?|park (it|that)|shelve|let'?s revisit|maybe later|not now)/i.test(
        text,
      )
        ? lang === 'en'
          ? '"Let\'s park it for now"'
          : '「先这样，再看看」'
        : null,
  },
]

/** Max entries produced by a single message, red pages first. */
const MAX_PER_MESSAGE = 3

export function analyzeMessage(ctx: RuleContext): RuleMatch[] {
  // L0 zero-cost filters: empty, punctuation/emoji-only text carries no
  // signal. Single characters are noise on every tier except sharp, where
  // the bare-no whitelist legitimately fires on one-word turns.
  const trimmed = ctx.text.trim()
  if (trimmed.length === 0) return []
  if (trimmed.length < 2 && ctx.sensitivity !== 'sharp') return []
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return []

  const matches: RuleMatch[] = []
  for (const rule of RULES) {
    // Sensitivity wiring: skip rules not enabled for the current tier.
    if (rule.tiers !== undefined && !rule.tiers.includes(ctx.sensitivity)) continue
    const title = rule.match(ctx)
    if (title === null) continue
    matches.push({
      ruleId: rule.id,
      kind: rule.kind,
      severity: rule.severity,
      deltas: rule.deltas,
      tags: tagsFor(rule.id, ctx.lang),
      title,
      quote: excerpt(ctx.text),
    })
  }
  // Red first (most newsworthy), then by severity desc, then definition order.
  const order = (k: PageKind) => (k === 'red' ? 0 : k === 'fold' ? 1 : 2)
  matches.sort((a, b) => order(a.kind) - order(b.kind) || b.severity - a.severity)
  return matches.slice(0, MAX_PER_MESSAGE)
}

export function ruleById(id: string): RuleDef | undefined {
  return RULES.find((rule) => rule.id === id)
}

/** Co-conspiracy entry written at turn end. Returns quiet when over the daily visible cap. */
export function churnEntry(
  turnToolCalls: number,
  lang: Lang = 'zh',
  churnToday = 0,
): { deltas: Deltas; title: string; quiet: boolean } | null {
  if (turnToolCalls < 15) return null
  return {
    deltas: { collusion: 2, trust: 1 },
    quiet: churnToday >= 2,
    title:
      lang === 'en'
        ? `${turnToolCalls} tool calls together this turn`
        : `本回合一起跑了 ${turnToolCalls} 次工具`,
  }
}

export const ALL_RULE_IDS = RULES.map((rule) => rule.id)
