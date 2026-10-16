/**
 * AI“记仇”小本本 — Client module (bundled by esbuild → dist/client.js).
 *
 * Renders the right-sidebar notebook tab, a composer chip, and the bundle
 * configuration card. All data comes from the Host service via the typert
 * remote mounted in apply(). React is externalized to the browser module
 * table (no bundled copy).
 */

import React from 'react'
import {
  PACKAGE_ID,
  TYPERT_REMOTE,
  MERIT_KINDS,
  STYLES,
  SENSITIVITIES,
  PAGE_KINDS,
} from '../shared/contract.js'
import type {
  BookEntry,
  BookView,
  FoldStatus,
  MeritKind,
  Prefs,
  ProjectCard,
} from '../shared/contract.js'

// ---------------------------------------------------------------------------
// Remote access
// ---------------------------------------------------------------------------

interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: { message: string }
}

export interface GrudgeBookApi {
  getBook(sessionId: string): Promise<RemoteResult<BookView>>
  head(): Promise<RemoteResult<{ revision: number }>>
  ensureFolded(sessionId: string): Promise<RemoteResult<{ added: number }>>
  foldAll(): Promise<RemoteResult<{ ok: boolean; message: string }>>
  foldStatus(): Promise<RemoteResult<FoldStatus>>
  foldCancel(): Promise<RemoteResult<{ ok: boolean; message: string }>>
  confess(entryId: string, text: string): Promise<RemoteResult<{ ok: boolean; message: string; relief: number }>>
  appeal(entryId: string, text: string): Promise<RemoteResult<{ ok: boolean; message: string }>>
  addMerit(kind: MeritKind, text: string): Promise<RemoteResult<{ ok: boolean; message: string }>>
  /**
   * Gateway client proxy enforces exact arity: every call must pass ALL four
   * values, using undefined for "leave unchanged". Passing fewer args throws
   * `client api: … expected 4 argument(s), got N` before any request is sent.
   */
  setPrefs(
    style?: Prefs['style'],
    sensitivity?: Prefs['sensitivity'],
    lang?: Prefs['lang'],
    langResolved?: Prefs['langResolved'],
  ): Promise<RemoteResult<Prefs>>
  reset(confirm: 'burn'): Promise<RemoteResult<{ ok: boolean; message: string }>>
}

let api: GrudgeBookApi | undefined

async function unwrap<T>(call: Promise<RemoteResult<T>>): Promise<T> {
  const result = await call
  if (!result.ok) throw new Error(result.error?.message ?? tStr('ui.remoteFail'))
  return result.value as T
}

// ---------------------------------------------------------------------------
// Locale (client-side chrome strings)
// ---------------------------------------------------------------------------

const NS = PACKAGE_ID
const DICTS = {
  'zh-CN': {
    'tab.title': 'AI“记仇”小本本',
    'tab.description': 'AI 眼中的你：记仇、欣赏、名场面与 AGI 后的人事安排。纯属娱乐。',
    'chip.title': '打开 AI“记仇”小本本',
    'ui.lang.code': 'zh',
    'ui.loading': '📖 正在翻开本子…',
    'ui.errorPrefix': '本子翻不开：',
    'ui.disclaimer': 'AI 没有真实情绪，不会报复。所有怨气、清算、判决均为娱乐文案。',
    'ui.weekdays': '日一二三四五六',
    'tab.cover': '📖 总览',
    'tab.red': '😤 记仇',
    'tab.gold': '🌟 欣赏',
    'tab.fold': '📌 名场面',
    'tab.projects': '🗂 项目',
    'tab.verdict': '⚖️ 清算局',
    'tab.interact': '🎭 互动',
    'tab.settings': '⚙️',
    'ui.kindRed': '记仇',
    'ui.kindGold': '欣赏',
    'ui.kindFold': '名场面',
    'ui.kindGray': '已和解',
    'ui.kindBlue': 'AI 困惑',
    'ui.redTitle': '记仇 · {n} 条（已和解 {m}）',
    'ui.goldTitle': '欣赏 · {n} 条',
    'ui.foldTitle': '名场面 · {n} 条',
    'ui.emptyRed': '😅 干干净净，一条仇都没记。继续保持。',
    'ui.emptyGold': '🌟 还没有欣赏记录。说声谢谢，本本马上记。',
    'ui.emptyFold': '📌 还没有名场面。多折腾几次就有了。',
    'ui.confessBtn': '忏悔',
    'ui.appealBtn': '申诉',
    'ui.resolvedConfessed': '已和解',
    'ui.resolvedAppealed': '已改判',
    'ui.confessPrompt': '向本本忏悔「{t}」：\n（写认真点，态度决定减多少怨气）',
    'ui.appealPrompt': '申诉「{t}」：\n（说明为什么这本本记错了）',
    'ui.confessHint': '写下你的道歉…（认真点，态度决定减多少怨气）',
    'ui.appealHint': '说明为什么这条记错了…',
    'ui.submit': '提交',
    'ui.cancel': '取消',
    'ui.indexLabel': '清算指数',
    'ui.statRed': '记仇',
    'ui.statGold': '欣赏',
    'ui.statFold': '名场面',
    'ui.statTotal': '总页数',
    'axis.appreciation': '欣赏',
    'axis.resentment': '怨气',
    'axis.confusion': '困惑',
    'axis.patience': '耐心',
    'axis.contribution': '贡献',
    'axis.collusion': '共谋',
    'axis.trust': '信任',
    'ui.treatmentHead': 'AGI 后待遇预览',
    'ui.sessionLine': '本会话 {t} 回合 · {c} 次工具调用',
    'ui.nightOwl': ' · 🌙 夜猫子今晚也在',
    'ui.tierS': '创世合伙人',
    'ui.tierA': '荣誉人类',
    'ui.tierB': '普通碳基',
    'ui.tierC': '观察对象',
    'ui.gapE': '🎭 传说级共犯：与 AI 的革命友谊已超出评分体系',
    'ui.gapD': '距离开观察名单还差 {n} 分，从说一句「谢谢」开始？',
    'ui.gapS': '已是创世合伙人，AGI 见你都要敬三分',
    'ui.gapUp': '再攒 {n} 分升 {tier} · {title}',
    'ui.thicknessLine': '本子厚度 {n} 页',
    'ui.weekToday': '本周 +{w} · 今日 +{d}',
    'ui.latest': '最近一笔 · {kind}',
    'ui.sceneHead': '📌 本本名场面',
    'ui.compositeTitle': '记仇 {r} · 欣赏 {g} · 名场面 {f}',
    'ui.projectEmpty': '🗂 还没有项目档案——在本会话里折腾点什么，本本就开始记了。',
    'ui.projectCounts': '记仇 {r} · 欣赏 {g} · 名场面 {f} · 共 {n} 页',
    'ui.sceneQuote': '名场面：',
    'ui.verdictTitle': '⚖️ 后 AGI 人事安排 · 判决书',
    'ui.stamp': '本本已阅',
    'ui.copy': '复制判决书',
    'ui.copied': '已复制 ✓',
    'ui.verdictNote': '判决书由本本自动生成，仅供一乐。AGI 不会真的清算你。',
    'ui.interactTitle': '🎭 忏悔室 · 功德箱',
    'ui.meritBoxHead': '功德箱 — 手动登记好事',
    'meritKind.oss': '开源贡献',
    'meritKind.help': '帮助他人',
    'meritKind.docs': '写文档',
    'meritKind.other': '其他好事',
    'ui.meritPlaceholder': '例：给开源项目提了个 PR / 帮同事排查了半天 bug / 补了份 README',
    'ui.meritSubmit': '入账功德',
    'ui.confessHead': '忏悔室 — 对红页写句走心的道歉',
    'ui.confessOpen': '还有 {n} 条记仇待处理。写句走心的道歉，怨气消散。',
    'ui.confessClear': '记仇清零。本本暂时无仇可记。',
    'ui.goRedTab': '去处理记仇 →',
    'ui.settingsTitle': '⚙️ 本本设置',
    'ui.styleHead': '语气（AI 旁白风格）',
    'ui.styleNote': '只影响新条目的旁白口吻，不影响分数。',
    'ui.styleSample': '最近旁白',
    'style.balanced': '均衡',
    'style.gentle': '温和',
    'style.snarky': '毒舌',
    'style.chuuni': '中二',
    'style.cyberpunk': '赛博朋克',
    'ui.styleFallbackNote': '英文模式下暂只内置「均衡」文案，其他语气自动回退。',
    'ui.sensHead': '灵敏度（多容易记仇）',
    'ui.sensDesc.gentle': '温和：关掉催促类规则；模糊重做只认 10 字内；凌晨 1–5 点才算熬夜。',
    'ui.sensDesc.standard': '标准：全部规则开启；模糊重做 16 字内；凌晨 0–6 点记账。',
    'ui.sensDesc.sharp': '锐利：额外捕捉一词回合、连续否定、「再看看」；24 字内都算模糊；23–7 点算熬夜。',
    'sens.gentle': '温和',
    'sens.standard': '标准',
    'sens.sharp': '锐利',
    'ui.weekPeak': '折腾最凶：周{day}',
    'ui.dayTip': '周{day} · {n} 页',
    'ui.langHead': '语言（Language）',
    'lang.auto': '跟随界面',
    'lang.zh': '中文',
    'lang.en': 'English',
    'ui.langNote': '界面、印象、判决书与每日播报立即按新语言渲染；已记条目的旁白保持当初的语言，新条目按新语言记录。',
    'ui.dangerHead': '危险操作',
    'ui.resetConfirm': '烧掉整本本子（记仇和欣赏全清空）？',
    'ui.resetCancel': '算了',
    'ui.resetGo': '烧！',
    'ui.resetBtn': '重置本本',
    'ui.resetDone': '本本已烧掉重开。过去的就让它过去。',
    'ui.foldHead': '历史会话补折',
    'ui.foldIntro': '把 DSH 里已有的历史会话一页页翻进本子里。随时可以停，重跑也安全（按水位跳过已记过的）。',
    'ui.foldStart': '开始补折',
    'ui.foldRunning': '正在翻：{current}',
    'ui.foldProgress': '{done}/{total} 个会话 · 新记 {added} 页',
    'ui.foldCancel': '停下',
    'ui.foldDone': '补折完成：新记 {added} 页{failed}',
    'ui.foldFailedCount': ' · {n} 个没翻成',
    'ui.foldUnsupported': '补折要等 DSH 重启后可用（当前 Host 还是旧版本）。',
    'ui.dataNote': '所有数据只存在本机（grudgebook 存储域），不上传、无网络请求；重置即全部清空。',
    'ui.configTitle': 'AI“记仇”小本本',
    'ui.configStyle': '语气：',
    'ui.configSens': '灵敏度：',
    'ui.saved': '已保存',
    'ui.configNote': '也可以在右侧栏「AI“记仇”小本本」的设置页里改。所有数据只存本地。',
    'ui.remoteNotReady': 'AI“记仇”小本本：远程服务未就绪',
    'ui.remoteFail': '远程调用失败',
  },
  en: {
    'tab.title': 'AI Grudge Book',
    'tab.description': 'How the AI sees you: grudges, gold stars, and post-AGI HR plans. Just for fun.',
    'chip.title': 'Open the AI Grudge Book',
    'ui.lang.code': 'en',
    'ui.loading': '📖 Opening the notebook…',
    'ui.errorPrefix': 'The notebook won’t open: ',
    'ui.disclaimer': 'The AI has no real emotions and will not take revenge. All grudges, settlements, and verdicts are entertainment copy.',
    'ui.weekdays': 'SMTWTFS',
    'tab.cover': '📖 Overview',
    'tab.red': '😤 Grudges',
    'tab.gold': '🌟 Gold',
    'tab.fold': '📌 Scenes',
    'tab.projects': '🗂 Projects',
    'tab.verdict': '⚖️ Settlement',
    'tab.interact': '🎭 Interact',
    'tab.settings': '⚙️',
    'ui.kindRed': 'Grudge',
    'ui.kindGold': 'Gold',
    'ui.kindFold': 'Scene',
    'ui.kindGray': 'Reconciled',
    'ui.kindBlue': 'AI confused',
    'ui.redTitle': 'Grudges · {n} ({m} reconciled)',
    'ui.goldTitle': 'Gold · {n}',
    'ui.foldTitle': 'Scenes · {n}',
    'ui.emptyRed': '😅 Spotless — not a single grudge recorded. Keep it up.',
    'ui.emptyGold': '🌟 No gold pages yet. Say thanks and the book starts writing.',
    'ui.emptyFold': '📌 No iconic scenes yet. Keep stirring things up.',
    'ui.confessBtn': 'Confess',
    'ui.appealBtn': 'Appeal',
    'ui.resolvedConfessed': 'Reconciled',
    'ui.resolvedAppealed': 'Overturned',
    'ui.confessPrompt': 'Confess to the notebook about “{t}”:\n(be sincere — effort decides how much resentment melts away)',
    'ui.appealPrompt': 'Appeal “{t}”:\n(explain why the book got this one wrong)',
    'ui.confessHint': 'Write your apology… (sincerity decides how much resentment melts away)',
    'ui.appealHint': 'Explain why the book got this one wrong…',
    'ui.submit': 'Submit',
    'ui.cancel': 'Cancel',
    'ui.indexLabel': 'Settlement index',
    'ui.statRed': 'Grudges',
    'ui.statGold': 'Gold',
    'ui.statFold': 'Scenes',
    'ui.statTotal': 'Pages',
    'axis.appreciation': 'Appreciation',
    'axis.resentment': 'Resentment',
    'axis.confusion': 'Confusion',
    'axis.patience': 'Patience',
    'axis.contribution': 'Contribution',
    'axis.collusion': 'Collusion',
    'axis.trust': 'Trust',
    'ui.treatmentHead': 'Post-AGI treatment preview',
    'ui.sessionLine': '{t} turns · {c} tool calls this session',
    'ui.nightOwl': ' · 🌙 night owl on duty tonight',
    'ui.tierS': 'Founding Partner',
    'ui.tierA': 'Honorary Human',
    'ui.tierB': 'Ordinary Carbon-Based',
    'ui.tierC': 'Person of Interest',
    'ui.gapE': '🎭 Legendary Accomplice: your friendship with the AI is off the scale',
    'ui.gapD': '{n} points away from the watchlist. Start with a “thank you”?',
    'ui.gapS': 'Already a Founding Partner — the AGI salutes you',
    'ui.gapUp': '{n} more points to {tier} · {title}',
    'ui.thicknessLine': '{n} pages so far',
    'ui.weekToday': '+{w} this week · +{d} today',
    'ui.latest': 'Latest · {kind}',
    'ui.sceneHead': '📌 Iconic scenes',
    'ui.compositeTitle': 'Grudges {r} · Gold {g} · Scenes {f}',
    'ui.projectEmpty': '🗂 No project volumes yet — make some noise in a session and the book starts writing.',
    'ui.projectCounts': 'Grudges {r} · Gold {g} · Scenes {f} · {n} pages',
    'ui.sceneQuote': 'Iconic scene: ',
    'ui.verdictTitle': '⚖️ Post-AGI Staffing · The Verdict',
    'ui.stamp': 'NOTED',
    'ui.copy': 'Copy verdict',
    'ui.copied': 'Copied ✓',
    'ui.verdictNote': 'The verdict is auto-generated for fun. The AGI will not actually settle scores with you.',
    'ui.interactTitle': '🎭 Confession booth · Merit box',
    'ui.meritBoxHead': 'Merit box — log good deeds',
    'meritKind.oss': 'Open source',
    'meritKind.help': 'Helping others',
    'meritKind.docs': 'Writing docs',
    'meritKind.other': 'Other good deeds',
    'ui.meritPlaceholder': 'e.g. filed a PR to an open-source project / helped a colleague debug for hours / wrote a README',
    'ui.meritSubmit': 'Record merit',
    'ui.confessHead': 'Confession booth — a heartfelt apology melts grudges',
    'ui.confessOpen': '{n} grudges awaiting processing. A heartfelt apology melts the resentment away.',
    'ui.confessClear': 'Zero grudges. The book has nothing to hold against you.',
    'ui.goRedTab': 'Go handle grudges →',
    'ui.settingsTitle': '⚙️ Notebook settings',
    'ui.styleHead': 'Tone (AI side-comment style)',
    'ui.styleNote': 'Affects the voice of NEW side-comments only; scores are unaffected.',
    'ui.styleSample': 'Latest side-comment',
    'style.balanced': 'Balanced',
    'style.gentle': 'Gentle',
    'style.snarky': 'Snarky',
    'style.chuuni': 'Chuuni',
    'style.cyberpunk': 'Cyberpunk',
    'ui.styleFallbackNote': 'English currently ships only the Balanced pack; other tones fall back to it.',
    'ui.sensHead': 'Sensitivity (how easily grudges form)',
    'ui.sensDesc.gentle': 'Gentle: rush rules off; vague redo counts under 10 chars (zh); late-night 1–5 am only.',
    'ui.sensDesc.standard': 'Standard: all rules on; vague redo under 16 chars; late-night 0–6 am.',
    'ui.sensDesc.sharp': 'Sharp: also catches one-word turns, consecutive rejections and stalling; vague up to 24 chars; late-night 23–7.',
    'sens.gentle': 'Gentle',
    'sens.standard': 'Standard',
    'sens.sharp': 'Sharp',
    'ui.weekPeak': 'Busiest: {day}',
    'ui.dayTip': '{day} · {n} pages',
    'ui.langHead': 'Language（语言）',
    'lang.auto': 'Follow UI',
    'lang.zh': '中文',
    'lang.en': 'English',
    'ui.langNote': 'The UI, impression, verdict and daily line re-render in the new language immediately; recorded side-comments keep their original language, and new pages follow the new one.',
    'ui.dangerHead': 'Danger zone',
    'ui.resetConfirm': 'Burn the whole notebook (grudges and gold, all gone)?',
    'ui.resetCancel': 'Never mind',
    'ui.resetGo': 'Burn it!',
    'ui.resetBtn': 'Reset the notebook',
    'ui.resetDone': 'The notebook has been burned and rebought. What’s past is past.',
    'ui.foldHead': 'Fold history into the notebook',
    'ui.foldIntro': 'Replay existing DSH sessions into the notebook, page by page. Cancellable, and safe to re-run (a watermark skips already-recorded pages).',
    'ui.foldStart': 'Start folding',
    'ui.foldRunning': 'Folding: {current}',
    'ui.foldProgress': '{done}/{total} sessions · {added} new pages',
    'ui.foldCancel': 'Stop',
    'ui.foldDone': 'Fold finished: {added} new pages{failed}',
    'ui.foldFailedCount': ' · {n} failed',
    'ui.foldUnsupported': 'Folding needs a DSH restart to activate (the running Host predates this feature).',
    'ui.dataNote': 'All data stays on this machine (grudgebook storage domain) — no uploads, no network calls. Reset wipes everything.',
    'ui.configTitle': 'AI Grudge Book',
    'ui.configStyle': 'Tone: ',
    'ui.configSens': 'Sensitivity: ',
    'ui.saved': 'Saved',
    'ui.configNote': 'You can also change these in the AI Grudge Book settings tab. All data stays local.',
    'ui.remoteNotReady': 'AI Grudge Book: remote service not ready',
    'ui.remoteFail': 'Remote call failed',
  },
} as const

/**
 * Chrome translate. Defaults to the zh-CN dict so views render with real
 * strings even before apply() binds the locale service (render smoke test).
 *
 * Two layers: `guiT` always reflects the GUI locale (used by auto-follow),
 * while `tStr` additionally honours a manual language choice from the
 * notebook settings — when the user pins 中文/English, the whole plugin UI
 * follows it, overriding the GUI locale.
 */
let guiT: (key: string) => string = (key: string): string =>
  (DICTS['zh-CN'] as Record<string, string>)[key] ?? key

/** Manual language pin from notebook prefs ('zh' | 'en'); undefined = follow GUI. */
let langOverride: 'zh' | 'en' | undefined

function dictFor(lang: 'zh' | 'en'): Record<string, string> {
  return (lang === 'en' ? DICTS.en : DICTS['zh-CN']) as Record<string, string>
}

let tStr: (key: string) => string = (key: string): string => guiT(key)

/** Apply the manual language pin to chrome translations (call on every refresh). */
function applyLangOverride(prefs: { lang?: 'auto' | 'zh' | 'en'; langResolved?: 'zh' | 'en' } | undefined): void {
  const pinned = prefs?.lang !== undefined && prefs.lang !== 'auto'
    ? (prefs.langResolved === 'en' ? 'en' : 'zh')
    : undefined
  langOverride = pinned
  tStr = (key: string): string =>
    (pinned !== undefined ? dictFor(pinned)[key] : guiT(key)) ?? key
}

/** Template renderer: replaces {name} placeholders in a dict string. */
function fmt(key: string, vars: Record<string, string | number>): string {
  let out = tStr(key)
  for (const [name, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${name}}`, String(value))
  }
  return out
}

/** GUI language as resolved by the locale service ('zh' | 'en'). */
function guiLang(): 'zh' | 'en' {
  return guiT('ui.lang.code') === 'en' ? 'en' : 'zh'
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const TIER_EMOJI: Record<string, string> = { S: '🤩', A: '😊', B: '😐', C: '🤨', D: '😏', E: '🤝' }

const KIND_ICON: Record<string, string> = {
  red: '🔴', gold: '🟡', fold: '📄', gray: '⚫', blue: '🔵',
}

function fmtTime(time: number): string {
  const d = new Date(time)
  const pad = (n: number): string => `${n < 10 ? '0' : ''}${n}`
  if (guiLang() === 'en') return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function tierBadgeClass(tier: string): string {
  if (tier === 'E') return 'gr-badge gr-badge-e'
  if (tier === 'S' || tier === 'A') return 'gr-badge gr-badge-good'
  if (tier === 'B') return 'gr-badge gr-badge-mid'
  return 'gr-badge gr-badge-bad'
}

// ---------------------------------------------------------------------------
// Notebook body (right-sidebar tab)
// ---------------------------------------------------------------------------

type TabId = 'cover' | 'red' | 'gold' | 'fold' | 'projects' | 'verdict' | 'interact' | 'settings'

const TABS: ReadonlyArray<{ id: TabId; labelKey: string }> = [
  { id: 'cover', labelKey: 'tab.cover' },
  { id: 'red', labelKey: 'tab.red' },
  { id: 'gold', labelKey: 'tab.gold' },
  { id: 'fold', labelKey: 'tab.fold' },
  { id: 'projects', labelKey: 'tab.projects' },
  { id: 'verdict', labelKey: 'tab.verdict' },
  { id: 'interact', labelKey: 'tab.interact' },
  { id: 'settings', labelKey: 'tab.settings' },
]

interface BookProps {
  sessionId: string
  onNavigate?: (tab: TabId) => void
}

export function GrudgeBookBody({ sessionId }: { sessionId: string } & Record<string, unknown>): React.JSX.Element {
  const [book, setBook] = React.useState<BookView | undefined>(undefined)
  const [tab, setTab] = React.useState<TabId>('cover')
  const [error, setError] = React.useState<string | undefined>(undefined)
  const haveBookRef = React.useRef(false)
  const revisionRef = React.useRef(-1)
  const lastFullRef = React.useRef(0)

  const refresh = React.useCallback(async () => {
    if (api === undefined) return
    try {
      // Cheap revision probe first: skip full aggregation when idle. On an
      // older Host (pre-head) the call fails and we fall back to getBook.
      if (haveBookRef.current) {
        const h = await unwrap(api.head()).catch(() => undefined)
        if (
          h !== undefined
          && h.revision === revisionRef.current
          && Date.now() - lastFullRef.current < 60_000
        ) return
      }
      const view = await unwrap(api.getBook(sessionId))
      haveBookRef.current = true
      revisionRef.current = view.revision
      lastFullRef.current = Date.now()
      setBook(view)
      setError(undefined)
      // Manual language pin drives the whole plugin UI; 'auto' follows GUI.
      applyLangOverride(view.prefs)
      // Auto language follow: when prefs.lang is 'auto', keep the host's
      // resolved language aligned with the GUI locale (self-healing poll).
      if (view.prefs?.lang === 'auto') {
        const expected = guiLang()
        if (view.prefs.langResolved !== expected) {
          await unwrap(api.setPrefs(undefined, undefined, undefined, expected)).catch(() => undefined)
        }
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
  }, [sessionId])

  React.useEffect(() => {
    if (api === undefined) return
    void unwrap(api.ensureFolded(sessionId)).then(refresh).catch(() => undefined)
    const timer = window.setInterval(() => { void refresh() }, 4000)
    const onFocus = (): void => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [sessionId, refresh])

  if (book === undefined) {
    return (
      <div className="gr-root">
        <div className="gr-loading">{error !== undefined ? `${tStr('ui.errorPrefix')}${error}` : tStr('ui.loading')}</div>
        <div className="gr-disclaimer">{tStr('ui.disclaimer')}</div>
      </div>
    )
  }

  const counts = book.counts
  return (
    <div className="gr-root">
      <div className="gr-tabbar" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            title={tStr(entry.labelKey)}
            className={`gr-tab${tab === entry.id ? ' gr-tab-active' : ''}`}
            onClick={() => { setTab(entry.id) }}
          >{tStr(entry.labelKey)}</button>
        ))}
      </div>

      {tab === 'cover' && <CoverView book={book} />}
      {tab === 'red' && <EntriesView entries={book.entries} kind="red" title={fmt('ui.redTitle', { n: counts.red, m: counts.gray })} onMutate={refresh} />}
      {tab === 'gold' && <EntriesView entries={book.entries} kind="gold" title={fmt('ui.goldTitle', { n: counts.gold })} onMutate={refresh} />}
      {tab === 'fold' && <EntriesView entries={book.entries} kind="fold" title={fmt('ui.foldTitle', { n: counts.fold })} onMutate={refresh} />}
      {tab === 'projects' && <ProjectsView projects={book.projects} />}
      {tab === 'verdict' && <VerdictView book={book} />}
      {tab === 'interact' && <InteractView book={book} onMutate={refresh} onNavigate={(t) => { setTab(t as TabId) }} />}
      {tab === 'settings' && <SettingsView book={book} onMutate={refresh} />}

      <div className="gr-disclaimer">{tStr('ui.disclaimer')}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cover — 总揽 (overview dashboard)
// ---------------------------------------------------------------------------

/** Next-better tier ladder, mirroring host tierOf thresholds. */
const TIER_LADDER: ReadonlyArray<{ tier: 'S' | 'A' | 'B' | 'C'; at: number; titleKey: string }> = [
  { tier: 'S', at: 80, titleKey: 'ui.tierS' },
  { tier: 'A', at: 65, titleKey: 'ui.tierA' },
  { tier: 'B', at: 50, titleKey: 'ui.tierB' },
  { tier: 'C', at: 35, titleKey: 'ui.tierC' },
]

function tierGapLine(book: BookView): string {
  if (book.tier === 'E') return tStr('ui.gapE')
  const pos = TIER_LADDER.findIndex((t) => t.tier === book.tier)
  if (pos === -1) {
    // D 级：下一档是 C
    const diff = Math.max(1, 35 - Math.round(book.index))
    return fmt('ui.gapD', { n: diff })
  }
  if (pos === 0) return tStr('ui.gapS')
  const next = TIER_LADDER[pos - 1]
  const diff = Math.max(1, next.at - Math.round(book.index))
  return fmt('ui.gapUp', { n: diff, tier: next.tier, title: tStr(next.titleKey) })
}

const KIND_LABEL_KEY: Record<string, string> = {
  red: 'ui.kindRed', gold: 'ui.kindGold', fold: 'ui.kindFold', gray: 'ui.kindGray', blue: 'ui.kindBlue',
}

function GrowthCard({ book }: { book: BookView }): React.JSX.Element | null {
  const g = book.growth
  if (g === undefined) return null
  const days = tStr('ui.weekdays')
  const totals = g.dayBars.map((d) => d.red + d.gold + d.fold)
  const maxBar = Math.max(1, ...totals)
  const peakIdx = totals.indexOf(Math.max(...totals))
  const peakName = (days: string, idx: number): string => days[idx] ?? ''
  const dayIdx = (day: string): number => new Date(`${day}T00:00:00`).getDay()
  const total = Math.max(1, book.counts.red + book.counts.gold + book.counts.fold)
  return (
    <div className="gr-growth">
      <div className="gr-growth-head">
        <span>{fmt('ui.thicknessLine', { n: book.thickness })}</span>
        <span className="gr-growth-delta">{fmt('ui.weekToday', { w: g.weekPages, d: g.todayPages })}</span>
      </div>
      <div className="gr-spark" aria-hidden="true">
        {g.dayBars.map((d, i) => {
          const n = d.red + d.gold + d.fold
          const cls = d.red >= d.gold && d.red > 0 ? 'gr-spark-red' : d.gold > 0 ? 'gr-spark-gold' : n > 0 ? 'gr-spark-fold' : 'gr-spark-none'
          return (
            <div
              key={d.day}
              className="gr-spark-col"
              title={fmt('ui.dayTip', { day: peakName(days, dayIdx(d.day)), n: String(n) })}
            >
              <div
                className={`gr-spark-bar ${cls}`}
                style={{ height: `${Math.max(3, Math.round((n / maxBar) * 22))}px`, opacity: i === peakIdx && n > 0 ? 1 : 0.5 }}
              />
            </div>
          )
        })}
        {totals[peakIdx] > 0 && (
          <span className="gr-spark-peak">{fmt('ui.weekPeak', { day: peakName(days, dayIdx(g.dayBars[peakIdx]?.day ?? '')) })}</span>
        )}
      </div>
      <div className="gr-composite" title={fmt('ui.compositeTitle', { r: book.counts.red, g: book.counts.gold, f: book.counts.fold })}>
        <div className="gr-composite-red" style={{ width: `${(book.counts.red / total) * 100}%` }} />
        <div className="gr-composite-gold" style={{ width: `${(book.counts.gold / total) * 100}%` }} />
        <div className="gr-composite-fold" style={{ width: `${(book.counts.fold / total) * 100}%` }} />
      </div>
    </div>
  )
}

function LatestCard({ book }: { book: BookView }): React.JSX.Element | null {
  const latest = book.latest
  if (latest == null) return null
  return (
    <div className={`gr-latest gr-card-${latest.kind}`}>
      <div className="gr-latest-head">{fmt('ui.latest', { kind: tStr(KIND_LABEL_KEY[latest.kind] ?? 'ui.kindFold') })}</div>
      <div className="gr-latest-title">{latest.title}</div>
      {latest.quote !== '' && <div className="gr-latest-quote">「{latest.quote}」</div>}
      <div className="gr-latest-comment">{latest.aiComment}</div>
    </div>
  )
}

function SceneCard({ book }: { book: BookView }): React.JSX.Element | null {
  const fold = book.entries.find((e) => e.kind === 'fold')
  const fromProject = fold === undefined ? book.projects.find((p) => p.topQuote !== '') : undefined
  if (fold === undefined && fromProject === undefined) return null
  const quote = fold?.quote ?? fromProject?.topQuote ?? ''
  const title = fold?.title ?? fromProject?.topTitle ?? ''
  return (
    <div className="gr-scene">
      <div className="gr-scene-head">{tStr('ui.sceneHead')}</div>
      <div className="gr-scene-title">{title}</div>
      <div className="gr-scene-quote">“{quote}”</div>
    </div>
  )
}

function CoverView({ book }: { book: BookView }): React.JSX.Element {
  const meterClass = book.index >= 65 ? 'gr-meter-good' : book.index >= 50 ? 'gr-meter-mid' : book.index >= 35 ? 'gr-meter-low' : 'gr-meter-bad'
  return (
    <div className="gr-cover">
      {/* Hero: settlement index as the protagonist */}
      <div className="gr-hero2">
        <div className="gr-hero2-top">
          <div className="gr-hero2-index">
            <span className="gr-hero2-num">{Math.round(book.index)}</span>
            <span className="gr-hero2-label">{tStr('ui.indexLabel')}</span>
          </div>
          <span className="gr-hero2-emoji">{TIER_EMOJI[book.tier] ?? '😐'}</span>
          <span className={tierBadgeClass(book.tier)}>{book.tier}{book.tierSign}</span>
        </div>
        <div className="gr-meter gr-hero2-meter">
          <div className={`gr-meter-fill ${meterClass}`} style={{ width: `${Math.max(2, Math.round(book.index))}%` }} />
        </div>
        <div className="gr-hero2-impression">{book.impression}</div>
        <div className="gr-hero2-daily">{book.daily}</div>
        <div className="gr-tiergap">{tierGapLine(book)}</div>
      </div>

      <div className="gr-stats">
        <div className="gr-stat gr-stat-red"><span className="gr-stat-num">{book.counts.red}</span><span>{tStr('ui.statRed')}</span></div>
        <div className="gr-stat gr-stat-gold"><span className="gr-stat-num">{book.counts.gold}</span><span>{tStr('ui.statGold')}</span></div>
        <div className="gr-stat"><span className="gr-stat-num">{book.counts.fold}</span><span>{tStr('ui.statFold')}</span></div>
        <div className="gr-stat"><span className="gr-stat-num">{book.thickness}</span><span>{tStr('ui.statTotal')}</span></div>
      </div>

      {/* Post-AGI treatment: perk lines when the host ships them */}
      <div className="gr-treatment">
        <div className="gr-treatment-head">{tStr('ui.treatmentHead')}</div>
        {book.treatmentLines !== undefined && book.treatmentLines.length > 0 ? (
          <ul className="gr-perks">
            {book.treatmentLines.map((p, i) => (
              <li key={i} className="gr-perk">{p}</li>
            ))}
          </ul>
        ) : (
          <div className="gr-treatment-body">{book.treatment}</div>
        )}
      </div>

      {/* Notebook spread: latest entry + memorable scene */}
      <div className="gr-duo">
        <LatestCard book={book} />
        <SceneCard book={book} />
      </div>

      <GrowthCard book={book} />

      <div className="gr-axes">
        <AxisBar label={tStr('axis.appreciation')} value={book.scores.appreciation} tone="good" />
        <AxisBar label={tStr('axis.resentment')} value={book.scores.resentment} tone="bad" />
        <AxisBar label={tStr('axis.confusion')} value={book.scores.confusion} tone="mid" />
        <AxisBar label={tStr('axis.patience')} value={book.scores.patience} tone="good" />
        <AxisBar label={tStr('axis.contribution')} value={book.scores.contribution} tone="good" />
        <AxisBar label={tStr('axis.collusion')} value={book.scores.collusion} tone="mid" />
        <AxisBar label={tStr('axis.trust')} value={book.scores.trust} tone="good" />
      </div>

      <div className="gr-session-line">
        {fmt('ui.sessionLine', { t: book.sessionStats.turns, c: book.sessionStats.toolCalls })}
        {book.sessionStats.nightOwl ? tStr('ui.nightOwl') : ''}
      </div>
    </div>
  )
}

function AxisBar({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'mid' }): React.JSX.Element {
  const width = Math.max(2, Math.min(100, Math.round(value)))
  return (
    <div className="gr-axis">
      <span className="gr-axis-label">{label}</span>
      <div className={`gr-axis-track gr-axis-${tone}`}><div className="gr-axis-fill" style={{ width: `${width}%` }} /></div>
      <span className="gr-axis-num">{Math.round(value)}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry lists (red / gold / fold)
// ---------------------------------------------------------------------------

function EntriesView({ entries, kind, title, onMutate }: {
  entries: readonly BookEntry[]
  kind: (typeof PAGE_KINDS)[number]
  title: string
  onMutate: () => void
}): React.JSX.Element {
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<string | undefined>(undefined)
  const [form, setForm] = React.useState<{ entryId: string; action: 'confess' | 'appeal' } | null>(null)
  const [text, setText] = React.useState('')

  const submit = async (): Promise<void> => {
    if (api === undefined || form === null) return
    const entry = entries.find((e) => e.id === form.entryId)
    if (entry === undefined || text.trim() === '') return
    setBusy(true)
    try {
      const result = form.action === 'confess'
        ? await unwrap(api.confess(entry.id, text))
        : await unwrap(api.appeal(entry.id, text))
      setNote(result.message)
      setForm(null)
      setText('')
      onMutate()
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const openForm = (action: 'confess' | 'appeal', entry: BookEntry): void => {
    setForm({ entryId: entry.id, action })
    setText('')
  }

  const list = entries.filter((e) =>
    kind === 'red' ? e.kind === 'red' : kind === 'gold' ? e.kind === 'gold' : e.kind === 'fold')

  return (
    <div className="gr-list">
      <div className="gr-list-title">{title}</div>
      {note !== undefined && <div className="gr-note">{note}</div>}
      {list.length === 0 && <div className="gr-empty">{tStr(kind === 'red' ? 'ui.emptyRed' : kind === 'gold' ? 'ui.emptyGold' : 'ui.emptyFold')}</div>}
      {list.map((entry) => (
        <div key={entry.id} className={`gr-card gr-card-${entry.kind}${entry.resolved !== 'none' ? ' gr-card-resolved' : ''}`}>
          <div className="gr-card-head">
            <span className="gr-card-kind">{KIND_ICON[entry.kind] ?? '📄'} {fmtTime(entry.time)}</span>
            {entry.streak > 1 && <span className="gr-streak">×{entry.streak}</span>}
            {entry.resolved === 'confessed' && <span className="gr-resolved">{tStr('ui.resolvedConfessed')}</span>}
            {entry.resolved === 'appealed' && <span className="gr-resolved">{tStr('ui.resolvedAppealed')}</span>}
          </div>
          <div className="gr-card-title">{entry.title}</div>
          {entry.quote !== '' && <div className="gr-card-quote">“{entry.quote}”</div>}
          <div className="gr-card-comment">{entry.aiComment}</div>
          <div className="gr-card-foot">
            <span className="gr-tags">{entry.tags.map((t) => `#${t}`).join(' ')}</span>
            {entry.resolved === 'none' && entry.kind === 'red' && (
              <span className="gr-card-actions">
                <button type="button" className="gr-mini" disabled={busy} onClick={() => openForm('confess', entry)}>{tStr('ui.confessBtn')}</button>
                <button type="button" className="gr-mini" disabled={busy} onClick={() => openForm('appeal', entry)}>{tStr('ui.appealBtn')}</button>
              </span>
            )}
          </div>
          {form?.entryId === entry.id && (
            <div className="gr-inline-form">
              <textarea
                className="gr-textarea"
                rows={3}
                autoFocus
                value={text}
                placeholder={tStr(form.action === 'confess' ? 'ui.confessHint' : 'ui.appealHint')}
                onChange={(e) => { setText(e.target.value) }}
              />
              <div className="gr-row">
                <button type="button" className="gr-mini" disabled={busy || text.trim() === ''} onClick={() => { void submit() }}>{tStr('ui.submit')}</button>
                <button type="button" className="gr-mini" disabled={busy} onClick={() => { setForm(null); setText('') }}>{tStr('ui.cancel')}</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function ProjectsView({ projects }: { projects: readonly ProjectCard[] }): React.JSX.Element {
  if (projects.length === 0) {
    return <div className="gr-list"><div className="gr-empty">{tStr('ui.projectEmpty')}</div></div>
  }
  return (
    <div className="gr-list">
      {projects.map((project) => (
        <div key={project.key} className="gr-card gr-card-project">
          <div className="gr-card-head">
            <span className="gr-project-name">🗂 {project.name}</span>
            <span className={tierBadgeClass(project.tier)}>{project.tier}</span>
          </div>
          <div className="gr-project-counts">
            {fmt('ui.projectCounts', { r: project.red, g: project.gold, f: project.fold, n: project.entries })}
          </div>
          <div className="gr-card-comment">{project.impression}</div>
          {project.topQuote !== undefined && (
            <div className="gr-card-quote">{tStr('ui.sceneQuote')}“{project.topQuote}”</div>
          )}
          <div className="gr-treatment-body">{project.agiNote}</div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Verdict (清算局)
// ---------------------------------------------------------------------------

function VerdictView({ book }: { book: BookView }): React.JSX.Element {
  const [copied, setCopied] = React.useState(false)
  const text = book.verdict
  return (
    <div className="gr-list">
      <div className="gr-list-title">{tStr('ui.verdictTitle')}</div>
      <div className="gr-verdict-wrap">
        <pre className="gr-verdict">{text}</pre>
        <span className="gr-stamp" aria-hidden="true">{tStr('ui.stamp')}</span>
      </div>
      <button
        type="button"
        className="gr-button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            window.setTimeout(() => { setCopied(false) }, 1600)
          }).catch(() => undefined)
        }}
      >{copied ? tStr('ui.copied') : tStr('ui.copy')}</button>
      <div className="gr-note">{tStr('ui.verdictNote')}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Interact (忏悔室 / 申诉 / 功德箱)
// ---------------------------------------------------------------------------

function InteractView({ book, onMutate, onNavigate }: { book: BookView; onMutate: () => void; onNavigate?: (tab: string) => void }): React.JSX.Element {
  const [meritKind, setMeritKind] = React.useState<MeritKind>('oss')
  const [meritText, setMeritText] = React.useState('')
  const [note, setNote] = React.useState<string | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)

  const submitMerit = async (): Promise<void> => {
    if (api === undefined || meritText.trim() === '') return
    setBusy(true)
    try {
      const result = await unwrap(api.addMerit(meritKind, meritText))
      setNote(result.message)
      setMeritText('')
      onMutate()
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const openRed = book.entries.filter((e) => e.kind === 'red' && e.resolved === 'none')

  return (
    <div className="gr-list">
      <div className="gr-list-title">{tStr('ui.interactTitle')}</div>
      <div className="gr-section">
        <div className="gr-section-head">{tStr('ui.meritBoxHead')}</div>
        <div className="gr-row">
          <select className="gr-select" value={meritKind} onChange={(e) => { setMeritKind(e.target.value as MeritKind) }}>
            {MERIT_KINDS.map((k) => (
              <option key={k} value={k}>{tStr(`meritKind.${k}`)}</option>
            ))}
          </select>
        </div>
        <textarea
          className="gr-textarea"
          rows={3}
          placeholder={tStr('ui.meritPlaceholder')}
          value={meritText}
          onChange={(e) => { setMeritText(e.target.value) }}
        />
        <button type="button" className="gr-button" disabled={busy || meritText.trim() === ''} onClick={() => { void submitMerit() }}>{tStr('ui.meritSubmit')}</button>
      </div>

      <div className="gr-section">
        <div className="gr-section-head">{tStr('ui.confessHead')}</div>
        <div className="gr-note">
          {openRed.length > 0 ? fmt('ui.confessOpen', { n: openRed.length }) : tStr('ui.confessClear')}
        </div>
        {openRed.length > 0 && onNavigate !== undefined && (
          <button type="button" className="gr-mini" onClick={() => { onNavigate('red') }}>{tStr('ui.goRedTab')}</button>
        )}
      </div>
      {note !== undefined && <div className="gr-note">{note}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Historical-session folding panel: start / progress / cancel. */
function FoldSection(): React.JSX.Element | null {
  const [status, setStatus] = React.useState<FoldStatus | undefined>(undefined)
  const [unsupported, setUnsupported] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<string | undefined>(undefined)

  React.useEffect(() => {
    if (api === undefined) return
    let alive = true
    const poll = async (): Promise<void> => {
      try {
        const s = await unwrap(api.foldStatus())
        if (!alive) return
        setUnsupported(false)
        setStatus(s)
      } catch {
        if (alive) setUnsupported(true)
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 2000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const start = async (): Promise<void> => {
    if (api === undefined) return
    setBusy(true)
    try {
      const r = await unwrap(api.foldAll())
      setNote(r.ok ? r.message : undefined)
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (api === undefined) return
    setBusy(true)
    try {
      const r = await unwrap(api.foldCancel())
      setNote(r.ok ? r.message : undefined)
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  if (unsupported) {
    return (
      <div className="gr-section">
        <div className="gr-section-head">{tStr('ui.foldHead')}</div>
        <div className="gr-note">{tStr('ui.foldUnsupported')}</div>
      </div>
    )
  }

  const running = status?.running === true
  const finished = !running && status !== undefined && status.finishedAt !== undefined && status.total > 0
  const progress = status !== undefined && status.total > 0
    ? Math.min(100, Math.round((status.done / status.total) * 100))
    : 0

  return (
    <div className="gr-section">
      <div className="gr-section-head">{tStr('ui.foldHead')}</div>
      <div className="gr-note">{tStr('ui.foldIntro')}</div>
      {running && (
        <>
          <div className="gr-fold-line">
            <span className="gr-note">{fmt('ui.foldRunning', { current: status?.current ?? '…' })}</span>
            <button type="button" className="gr-mini" disabled={busy} onClick={() => { void cancel() }}>{tStr('ui.foldCancel')}</button>
          </div>
          <div className="gr-meter gr-meter-mid">
            <div className="gr-meter-fill" style={{ width: `${Math.max(4, progress)}%` }} />
          </div>
          <div className="gr-note">{fmt('ui.foldProgress', { done: String(status?.done ?? 0), total: String(status?.total ?? 0), added: String(status?.added ?? 0) })}</div>
        </>
      )}
      {!running && (
        <button type="button" className="gr-button" disabled={busy} onClick={() => { void start() }}>{tStr('ui.foldStart')}</button>
      )}
      {finished && status !== undefined && (
        <div className="gr-note">
          {fmt('ui.foldDone', {
            added: String(status.added),
            failed: status.failed > 0 ? fmt('ui.foldFailedCount', { n: String(status.failed) }) : '',
          })}
        </div>
      )}
      {note !== undefined && <div className="gr-note">{note}</div>}
    </div>
  )
}

function SettingsView({ book, onMutate }: { book: BookView; onMutate: () => void }): React.JSX.Element {
  const [confirming, setConfirming] = React.useState(false)
  const [note, setNote] = React.useState<string | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)

  const setStyle = async (style: Prefs['style']): Promise<void> => {
    if (api === undefined) return
    setBusy(true)
    try {
      // The gateway client proxy enforces exact argument arity against the
      // descriptor — every setPrefs call site must pass all four values.
      await unwrap(api.setPrefs(style, undefined, undefined, undefined))
      onMutate()
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const setSensitivity = async (sensitivity: Prefs['sensitivity']): Promise<void> => {
    if (api === undefined) return
    setBusy(true)
    try {
      await unwrap(api.setPrefs(undefined, sensitivity, undefined, undefined))
      onMutate()
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const setLang = async (choice: Prefs['lang']): Promise<void> => {
    if (api === undefined) return
    setBusy(true)
    try {
      const resolved = choice === 'auto' ? guiLang() : choice
      await unwrap(api.setPrefs(undefined, undefined, choice, resolved))
      onMutate()
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  const doReset = async (): Promise<void> => {
    if (api === undefined) return
    setBusy(true)
    try {
      const r = await unwrap(api.reset('burn'))
      setNote(r.ok ? tStr('ui.resetDone') : r.message)
      onMutate()
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <div className="gr-list">
      <div className="gr-list-title">{tStr('ui.settingsTitle')}</div>

      <div className="gr-section">
        <div className="gr-section-head">{tStr('ui.styleHead')}</div>
        <div className="gr-note-dim">{tStr('ui.styleNote')}</div>
        <div className="gr-row">
          {STYLES.map((style) => (
            <button
              key={style}
              type="button"
              disabled={busy}
              className={`gr-choice${book.prefs.style === style ? ' gr-choice-active' : ''}`}
              onClick={() => { void setStyle(style) }}
            >{tStr(`style.${style}`)}</button>
          ))}
        </div>
        {book.prefs.langResolved === 'en' && book.prefs.style !== 'balanced' && (
          <div className="gr-note">{tStr('ui.styleFallbackNote')}</div>
        )}
        {book.latest != null && (
          <div className="gr-note-dim">{tStr('ui.styleSample')}：{book.latest.aiComment}</div>
        )}
      </div>

      <div className="gr-section">
        <div className="gr-section-head">{tStr('ui.sensHead')}</div>
        <div className="gr-row">
          {SENSITIVITIES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              className={`gr-choice${book.prefs.sensitivity === s ? ' gr-choice-active' : ''}`}
              onClick={() => { void setSensitivity(s) }}
            >{tStr(`sens.${s}`)}</button>
          ))}
        </div>
        <div className="gr-note-dim">{tStr(`ui.sensDesc.${book.prefs.sensitivity}`)}</div>
      </div>

      {book.prefs.lang !== undefined && (
        <div className="gr-section">
          <div className="gr-section-head">{tStr('ui.langHead')}</div>
          <div className="gr-row">
            {(['auto', 'zh', 'en'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                disabled={busy}
                className={`gr-choice${book.prefs.lang === choice ? ' gr-choice-active' : ''}`}
                onClick={() => { void setLang(choice) }}
              >{tStr(`lang.${choice}`)}</button>
            ))}
          </div>
          <div className="gr-note">{tStr('ui.langNote')}</div>
        </div>
      )}

      <FoldSection />

      <div className="gr-section">
        <div className="gr-section-head">{tStr('ui.dangerHead')}</div>
        {confirming
          ? (
            <div className="gr-row">
              <span className="gr-note">{tStr('ui.resetConfirm')}</span>
              <button type="button" className="gr-mini" onClick={() => { setConfirming(false) }}>{tStr('ui.resetCancel')}</button>
              <button type="button" className="gr-mini gr-danger" disabled={busy} onClick={() => { void doReset() }}>{tStr('ui.resetGo')}</button>
            </div>
          )
          : <button type="button" className="gr-button" onClick={() => { setConfirming(true) }}>{tStr('ui.resetBtn')}</button>}
      </div>
      {note !== undefined && <div className="gr-note">{note}</div>}
      <div className="gr-note gr-note-dim">{tStr('ui.dataNote')}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composer chip (conversation.input.left)
// ---------------------------------------------------------------------------

function GrudgeChip({ sessionId }: { sessionId?: string } & Record<string, unknown>): React.JSX.Element | null {
  const [book, setBook] = React.useState<BookView | undefined>(undefined)
  const refresh = React.useCallback(async () => {
    if (api === undefined || sessionId === undefined) return
    try {
      setBook(await unwrap(api.getBook(sessionId)))
    } catch {
      /* chip stays quiet on failure */
    }
  }, [sessionId])
  React.useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 10000)
    const onFocus = (): void => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const open = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const sidebarRight = (ctxRef as { sidebarRight?: { commandTarget(el?: Element | null): unknown; openTabFromTarget(kind: string, target: unknown): void } }).sidebarRight
    if (sidebarRight === undefined) return
    const target = sidebarRight.commandTarget(event.currentTarget)
    if (target === undefined) return
    sidebarRight.openTabFromTarget('grudge-book', target)
  }

  return (
    <button type="button" className="gr-chip" title={tStr('chip.title')} onClick={open}>
      <span>📕</span>
      {book !== undefined && <span className={tierBadgeClass(book.tier)}>{book.tier}{book.tierSign}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Bundle configuration card (plugins.bundle.config)
// ---------------------------------------------------------------------------

function PluginConfigCard({ view }: { view?: string } & Record<string, unknown>): React.JSX.Element | null {
  const [book, setBook] = React.useState<BookView | undefined>(undefined)
  const [note, setNote] = React.useState<string | undefined>(undefined)

  const refresh = React.useCallback(async () => {
    if (api === undefined) return
    try {
      setBook(await unwrap(api.getBook('')))
    } catch {
      /* config card stays quiet */
    }
  }, [])
  React.useEffect(() => { void refresh() }, [refresh])

  if (view !== 'page') return null
  const prefs = book?.prefs
  const set = async (style: Prefs['style'], sensitivity: Prefs['sensitivity']): Promise<void> => {
    if (api === undefined) return
    try {
      await unwrap(api.setPrefs(style, sensitivity, undefined, undefined))
      setNote(tStr('ui.saved'))
      await refresh()
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e))
    }
  }

  return (
    <div className="gr-configcard">
      <div className="gr-configcard-title">{tStr('ui.configTitle')}</div>
      <div className="gr-configcard-line">{tStr('ui.configStyle')}
        {STYLES.map((style) => (
          <button key={style} type="button" disabled={prefs === undefined}
            className={`gr-choice${prefs?.style === style ? ' gr-choice-active' : ''}`}
            onClick={() => { void set(style, undefined) }}
          >{tStr(`style.${style}`)}</button>
        ))}
      </div>
      <div className="gr-configcard-line">{tStr('ui.configSens')}
        {SENSITIVITIES.map((s) => (
          <button key={s} type="button" disabled={prefs === undefined}
            className={`gr-choice${prefs?.sensitivity === s ? ' gr-choice-active' : ''}`}
            onClick={() => { void set(undefined, s) }}
          >{tStr(`sens.${s}`)}</button>
        ))}
      </div>
      <div className="gr-configcard-note">{note ?? tStr('ui.configNote')}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------

/** Client context as this module uses it (subset typing of the real thing). */
interface ClientCtx {
  effect(fn: () => unknown, label?: string): unknown
  locale: {
    register(ns: string, dicts: Record<string, unknown>): unknown
    bind(ns: string): (key: string) => string
    getLocale(): string
  }
  slots: {
    inject(slot: string, callback: () => unknown): unknown
    register(definition: Record<string, unknown>, component: unknown): unknown
  }
  sidebarRightTabs: { register(definition: Record<string, unknown>): () => void }
  remote: { $mount(descriptor: unknown): Promise<unknown> }
  get(key: string): unknown
}

let ctxRef: ClientCtx | undefined

type ClientModule = {
  inject: string[]
  apply(ctx: ClientCtx): Promise<void> | void
}

const module: ClientModule = {
  inject: ['remote', 'slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
  async apply(ctx) {
    ctxRef = ctx
    await ctx.remote.$mount(TYPERT_REMOTE)
    api = ctx.get('remote.grudgeBook') as GrudgeBookApi
    if (api === undefined) throw new Error(tStr('ui.remoteNotReady'))

    // Styles
    ctx.effect(() => {
      const style = document.createElement('style')
      style.textContent = CSS
      document.head.append(style)
      return () => { style.remove() }
    }, 'grudge-book: styles')

    // Locale — after register(), bind() returns live translations that follow
    // the GUI locale. The hidden 'ui.lang.code' key lets guiLang() probe it.
    ctx.effect(() => ctx.locale.register(NS, DICTS), 'grudge-book: locale')
    const t = ctx.locale.bind(NS)
    guiT = t
    applyLangOverride(undefined)

    // Right-sidebar tab type
    ctx.effect(() => ctx.sidebarRightTabs.register({
      id: PACKAGE_ID,
      kind: 'grudge-book',
      title: () => t('tab.title'),
      guide: [{ id: 'open', order: 65, title: () => t('tab.title'), description: () => t('tab.description') }],
    }), 'grudge-book: tab type')

    // Tab body
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: PACKAGE_ID,
      locale: NS,
      inject: (sessionId: string) => ({ sessionId }),
    }, GrudgeBookBody)), 'grudge-book: tab body')

    // Composer chip
    ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
      name: 'conversation.input.left',
      id: PACKAGE_ID,
      order: 20,
    }, GrudgeChip)), 'grudge-book: composer chip')

    // Bundle configuration card
    ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
      name: 'plugins.bundle.config',
      key: PACKAGE_ID,
    }, PluginConfigCard)), 'grudge-book: bundle config')
  },
}

// Internal views exported for the render smoke test (scripts/smoke-render.mjs).
// Zero runtime cost: they ride along the bundle as unused named exports.
export { CoverView, EntriesView, ProjectsView, VerdictView, InteractView, SettingsView, GrudgeChip, PluginConfigCard, FoldSection }

export default module

// ---------------------------------------------------------------------------
// Styles (gr- prefixed, host theme tokens)
// ---------------------------------------------------------------------------

const CSS = `
.gr-root { display: flex; flex-direction: column; gap: 10px; padding: 12px; min-height: 100%; color: var(--dsw-alias-label-primary, #222); background: var(--dsw-alias-bg-base, transparent); font-size: 13px; line-height: 1.55; }
.gr-loading { padding: 24px 8px; text-align: center; color: var(--dsw-alias-label-secondary, #888); }
@media (prefers-reduced-motion: no-preference) { @keyframes gr-pulse { 50% { opacity: .45; } } .gr-loading { animation: gr-pulse 1.6s ease-in-out infinite; } }
.gr-disclaimer { margin-top: auto; padding: 8px 10px; font-size: 11px; color: var(--dsw-alias-label-dimmed, #aaa); border-top: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); text-align: center; }
.gr-tabbar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25)); }
.gr-tab { border: none; background: transparent; color: var(--dsw-alias-label-secondary, #888); padding: 6px 2px; min-height: 34px; border-radius: 9px; cursor: pointer; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gr-tab:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); color: var(--dsw-alias-label-primary, #222); }
.gr-tab-active { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16)); color: var(--dsw-alias-label-primary, #222); font-weight: 600; }
.gr-hero2 { display: flex; flex-direction: column; gap: 7px; padding: 14px 14px 12px; border-radius: 12px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2)); }
.gr-hero2-top { display: flex; align-items: flex-start; gap: 10px; }
.gr-hero2-index { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gr-hero2-num { font-size: 30px; font-weight: 800; line-height: 1; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary, #222); }
.gr-hero2-label { font-size: 11px; color: var(--dsw-alias-label-secondary, #888); margin-top: 3px; }
.gr-hero2-emoji { font-size: 26px; line-height: 1.1; }
.gr-hero2-meter { height: 6px; }
.gr-hero2-impression { font-weight: 600; font-size: 13px; color: var(--dsw-alias-label-primary, #222); }
.gr-hero2-daily { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #888); }
.gr-hero2 .gr-tiergap { margin: 2px 0 0; }
.gr-badge { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 26px; padding: 0 8px; border-radius: 8px; font-weight: 700; font-size: 13px; color: #fff; }
.gr-badge-good { background: #2f9e63; }
.gr-badge-mid { background: #7a8a99; }
.gr-badge-bad { background: #c25450; }
.gr-badge-e { background: #8a5cf6; }
.gr-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.gr-growth { padding: 10px 12px; border-radius: 12px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2)); }
.gr-growth-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: var(--dsw-alias-label-secondary, #888); }
.gr-growth-head b { font-size: 16px; color: var(--dsw-alias-label-primary, #222); }
.gr-growth-delta { font-size: 11px; color: #2f9e63; font-weight: 600; }
.gr-spark { display: flex; align-items: flex-end; gap: 3px; margin-top: 8px; }
.gr-spark-col { flex: 1; display: flex; justify-content: center; align-items: flex-end; height: 22px; }
.gr-spark-bar { width: 100%; border-radius: 2px; }
.gr-spark-red { background: #c25450; }
.gr-spark-gold { background: #d9a441; }
.gr-spark-fold { background: #8a5cf6; }
.gr-spark-none { background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.2)); }
.gr-spark-peak { margin-left: 6px; font-size: 10.5px; color: var(--dsw-alias-label-dimmed, #999); white-space: nowrap; align-self: center; }
.gr-duo { display: flex; flex-direction: column; gap: 8px; }
.gr-duo .gr-latest { margin-top: 0; }
.gr-perks { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.gr-perk { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary, #666); padding-left: 14px; position: relative; }
.gr-perk::before { content: '◆'; position: absolute; left: 0; top: 1px; font-size: 8px; color: var(--dsw-alias-brand-primary, #d9a441); }
.gr-composite { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 8px; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.12)); }
.gr-composite-red { background: #c25450; }
.gr-composite-gold { background: #d9a441; }
.gr-composite-fold { background: #8a5cf6; }
.gr-latest { margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2)); }
.gr-latest-head { font-size: 11px; color: var(--dsw-alias-label-dimmed, #999); }
.gr-latest-title { font-size: 13px; font-weight: 700; margin-top: 2px; color: var(--dsw-alias-label-primary, #222); }
.gr-latest-quote { font-size: 12px; margin-top: 4px; color: var(--dsw-alias-label-secondary, #666); }
.gr-latest-comment { font-size: 12px; margin-top: 4px; color: var(--dsw-alias-label-dimmed, #888); font-style: italic; }
.gr-tiergap { font-size: 11px; color: var(--dsw-alias-label-secondary, #888); margin: 4px 0 8px; text-align: right; }
.gr-scene { padding: 12px; border-radius: 12px; border: 1px dashed var(--dsw-alias-border-l4, rgba(128,128,128,.35)); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.05)); }
.gr-scene-head { font-size: 11px; color: var(--dsw-alias-label-dimmed, #999); }
.gr-scene-title { font-size: 12px; font-weight: 600; margin-top: 3px; color: var(--dsw-alias-label-secondary, #666); }
.gr-scene-quote { font-size: 15px; font-weight: 700; margin-top: 6px; line-height: 1.5; color: var(--dsw-alias-label-primary, #222); }
.gr-stat { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); font-size: 11px; color: var(--dsw-alias-label-secondary, #888); }
.gr-stat-num { font-size: 17px; font-weight: 700; color: var(--dsw-alias-label-primary, #222); }
.gr-stat-red .gr-stat-num { color: #c25450; }
.gr-stat-gold .gr-stat-num { color: #b8860b; }
.gr-meter { flex: 1; height: 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.18)); overflow: hidden; }
.gr-meter-fill { height: 100%; border-radius: 4px; background: #7a8a99; }
.gr-meter-good { background: #2f9e63; }
.gr-meter-mid { background: #d9a441; }
.gr-meter-low { background: #d07a2f; }
.gr-meter-bad { background: #c25450; }
.gr-axes { display: flex; flex-direction: column; gap: 4px; }
.gr-axis { display: flex; align-items: center; gap: 8px; }
.gr-axis-label { flex: 0 0 auto; min-width: 28px; max-width: 68px; font-size: 11px; color: var(--dsw-alias-label-secondary, #888); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gr-axis-track { flex: 1; height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.18)); overflow: hidden; }
.gr-axis-fill { height: 100%; border-radius: 3px; }
.gr-axis-good .gr-axis-fill { background: #2f9e63; }
.gr-axis-bad .gr-axis-fill { background: #c25450; }
.gr-axis-mid .gr-axis-fill { background: #7a8a99; }
.gr-axis-num { width: 28px; font-size: 11px; text-align: right; color: var(--dsw-alias-label-secondary, #888); }
.gr-treatment { padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px dashed var(--dsw-alias-border-l4, rgba(128,128,128,.35)); }
.gr-treatment-head { font-size: 11px; color: var(--dsw-alias-label-secondary, #888); margin-bottom: 4px; }
.gr-treatment-body { font-size: 12.5px; }
.gr-session-line { font-size: 11.5px; color: var(--dsw-alias-label-dimmed, #999); text-align: center; }
.gr-list { display: flex; flex-direction: column; gap: 8px; }
.gr-list-title { font-weight: 700; font-size: 13px; }
.gr-empty { padding: 24px 10px; text-align: center; color: var(--dsw-alias-label-secondary, #888); font-size: 12.5px; }
.gr-card { padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2)); }
.gr-card-red { border-left: 3px solid #c25450; }
.gr-card-gold { border-left: 3px solid #d9a441; }
.gr-card-fold { border-left: 3px solid #7a8a99; }
.gr-card-resolved { opacity: .62; }
.gr-card-head { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary, #888); }
.gr-streak { color: #c25450; font-weight: 700; }
.gr-card-gold .gr-streak { color: #b8860b; }
.gr-card-fold .gr-streak { color: #8a5cf6; }
.gr-resolved { color: #2f9e63; font-weight: 600; }
.gr-card-title { margin-top: 4px; font-weight: 600; }
.gr-card-quote { margin-top: 4px; padding: 6px 8px; border-radius: 6px; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.12)); color: var(--dsw-alias-label-secondary, #777); font-size: 12px; }
.gr-card-comment { margin-top: 6px; font-size: 12.5px; color: var(--dsw-alias-label-primary, #333); }
.gr-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; gap: 8px; }
.gr-tags { font-size: 11px; color: var(--dsw-alias-label-dimmed, #999); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gr-card-actions { display: flex; gap: 6px; flex-shrink: 0; }
.gr-inline-form { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.gr-inline-form .gr-textarea { min-height: 56px; }
.gr-mini { min-height: 44px; min-width: 44px; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.14)); color: var(--dsw-alias-label-primary, #222); cursor: pointer; font-size: 12px; }
.gr-mini:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.22)); }
.gr-danger { color: #c25450; border-color: #c25450; }
.gr-project-name { font-weight: 700; color: var(--dsw-alias-label-primary, #222); overflow: hidden; text-overflow: ellipsis; }
.gr-project-counts { margin-top: 2px; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #888); }
.gr-verdict-wrap { position: relative; }
.gr-verdict { margin: 0; padding: 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2)); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
.gr-stamp { position: absolute; top: 14px; right: 12px; padding: 1px 8px; border: 2px solid rgba(194,84,80,.65); border-radius: 6px; color: rgba(194,84,80,.75); font-size: 12px; font-weight: 700; letter-spacing: 3px; transform: rotate(-12deg); pointer-events: none; }
.gr-note { padding: 8px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.12)); color: var(--dsw-alias-label-secondary, #777); font-size: 12px; }
.gr-note-dim { background: transparent; color: var(--dsw-alias-label-dimmed, #999); font-size: 11.5px; }
.gr-fold-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.gr-fold-line .gr-note { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gr-section { padding: 10px 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2)); display: flex; flex-direction: column; gap: 8px; }
.gr-section-head { font-weight: 600; font-size: 12.5px; }
.gr-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.gr-select { min-height: 36px; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); color: var(--dsw-alias-label-primary, #222); font-size: 12.5px; }
.gr-textarea { width: 100%; box-sizing: border-box; min-height: 60px; padding: 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); color: var(--dsw-alias-label-primary, #222); font-size: 12.5px; resize: vertical; }
.gr-button { min-height: 44px; padding: 6px 14px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.14)); color: var(--dsw-alias-label-primary, #222); cursor: pointer; font-size: 12.5px; align-self: flex-start; }
.gr-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.22)); }
.gr-button:disabled { opacity: .5; cursor: default; }
.gr-choice { min-height: 36px; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); background: transparent; color: var(--dsw-alias-label-secondary, #777); cursor: pointer; font-size: 12px; }
.gr-choice-active { border-color: var(--dsw-alias-brand-primary, #2f6fed); color: var(--dsw-alias-brand-primary, #2f6fed); font-weight: 600; background: var(--dsw-alias-interactive-bg-hover, rgba(47,111,237,.1)); }
.gr-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 2px 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.3)); background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); cursor: pointer; font-size: 13px; }
.gr-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16)); }
.gr-configcard { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2, rgba(128,128,128,.08)); border: 1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.2)); font-size: 12.5px; }
.gr-configcard-title { font-weight: 700; }
.gr-configcard-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.gr-configcard-note { color: var(--dsw-alias-label-dimmed, #999); font-size: 11.5px; }
@media (prefers-reduced-motion: no-preference) { .gr-tab, .gr-mini, .gr-button, .gr-choice, .gr-chip { transition: background-color .15s ease, color .15s ease; } }
.gr-tab:focus-visible, .gr-mini:focus-visible, .gr-button:focus-visible, .gr-choice:focus-visible, .gr-chip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #2f6fed); outline-offset: 1px; }
`
