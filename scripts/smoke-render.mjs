// Full-render smoke test: build a REAL BookView through the Host pipeline
// (lib/host/aggregate.js buildView with realistic entries), then render every
// client view with real React 18 via renderToString.
// Catches any shape mismatch between Host data and client components.
//
// React resolution: local node_modules (pnpm install) → DSH checkout derived
// from the node_modules/@deepseek-ai symlinks → $DSH_ROOT.
import { createRequire } from 'node:module'
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(join(root, 'package.json'))

/** DSH checkout roots worth trying: $DSH_ROOT + roots implied by symlinked peers. */
const dshRoots = []
if (process.env.DSH_ROOT !== undefined && process.env.DSH_ROOT !== '') dshRoots.push(process.env.DSH_ROOT)
try {
  let dir = dirname(realpathSync(join(root, 'node_modules', '@deepseek-ai', 'cordis')))
  while (dir !== '/' && dir !== '.') {
    if (existsSync(join(dir, 'node_modules', '.pnpm'))) {
      dshRoots.push(dir)
      break
    }
    dir = dirname(dir)
  }
} catch {
  // no symlinked peer — external installs resolve react via devDependencies
}

let React
let ReactDOMServer
try {
  React = require('react')
  ReactDOMServer = require('react-dom/server')
} catch {
  const hit = dshRoots
    .flatMap((d) => {
      try {
        return readdirSync(join(d, 'node_modules', '.pnpm'))
          .filter((n) => n.startsWith('react@18') || n.startsWith('react-dom@18'))
          .map((n) => join(d, 'node_modules', '.pnpm', n, 'node_modules'))
      } catch {
        return []
      }
    })
    .map((dirpath) => {
      try {
        return {
          react: createRequire(join(dirpath, 'react', 'index.js')),
          dom: createRequire(join(dirpath, 'react-dom', 'server.js')),
        }
      } catch {
        return undefined
      }
    })
    .find(Boolean)
  if (hit === undefined) {
    console.error(
      'smoke-render: react/react-dom not found. Fix one of these ways:\n' +
      '  1. pnpm install        # installs devDependencies (react, react-dom)\n' +
      '  2. export DSH_ROOT=/path/to/deepseek-harness',
    )
    process.exit(1)
  }
  React = hit.react('react')
  ReactDOMServer = hit.dom('react-dom/server')
}

// ---- 1. real Host data ----------------------------------------------------
const { buildView } = await import(new URL('../lib/host/aggregate.js', import.meta.url))
const DAY = 86_400_000
const now = Date.now()
const entries = []
const mk = (i, kind, ruleId, deltas, project) => ({
  id: `s1:${i}:${ruleId}`, sessionId: 's1', seq: i, time: now - i * 3_600_000, kind,
  ruleId, title: `条目${i}`, quote: '这次真的是最后一版了', aiComment: '我上次也是这么信的。',
  tags: ['测试'], deltas, severity: 1, project, streak: 1, resolved: 'none',
})
for (let i = 0; i < 8; i++) entries.push(mk(i * 3 + 1, 'red', 'final-version', { resentment: 8, confusion: 1 }, '/tmp/proj-a'))
for (let i = 0; i < 5; i++) entries.push(mk(i * 3 + 2, 'gold', 'thanks', { appreciation: 6, trust: 1 }, '/tmp/proj-a'))
for (let i = 0; i < 3; i++) entries.push(mk(i * 3 + 3, 'fold', 'you-know', { confusion: 2 }, '/Users/x/proj-b'))
entries[0].resolved = 'confessed'
const book = buildView({
  entries,
  progressOf: () => ({ seq: 99, toolCalls: 12, turns: 6, lastNight: undefined }),
  sessionId: 's1', revision: 7,
  prefs: { style: 'balanced', sensitivity: 'standard' },
  now,
})
console.log('BookView keys:', Object.keys(book).length, '| verdict type:', typeof book.verdict, '| projects:', book.projects.length)

// ---- 2. load the client bundle with real React ----------------------------
const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')
const loader = { load: (entry) => { loader.result = entry.factory((id) => { if (id === 'react' || id.startsWith('react/')) return React; throw new Error('require ' + id) }) } }
const sandbox = {
  window: { __ModuleLoader__: loader },
  document: { createElement: () => ({ style: {} }), head: { append: () => {} } },
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox, { filename: 'client.js' })
const mod = loader.result.default ?? loader.result
if (typeof mod.apply !== 'function') throw new Error('bad module shape')

// apply() mounts remote + registers; for rendering we only need the components.
// Register nothing: skip apply, grab the default export's internals via a trick —
// the bundle also exports nothing named. Instead: run apply with stubs that
// capture nothing, then render the module's components from the exports map.
// Simpler: the bundle exports GrudgeBookBody (named). Render it directly.
const M = loader.result

// ---- 3. render every view with real data -----------------------------------
const failures = []
const render = (label, element) => {
  try {
    const html = ReactDOMServer.renderToString(element)
    if (html.length < 10) failures.push(`${label}: suspiciously short output`)
    else console.log(`render OK: ${label} (${html.length} chars)`)
  } catch (error) {
    failures.push(`${label}: ${String(error.stack ?? error).split('\n').slice(0, 3).join(' | ')}`)
  }
}

render('GrudgeBookBody (loading state)', React.createElement(M.GrudgeBookBody, { sessionId: 's1' }))
render('CoverView', React.createElement(M.CoverView, { book }))
render('EntriesView red', React.createElement(M.EntriesView, { entries: book.entries, kind: 'red', title: '红页', onMutate: () => {} }))
render('EntriesView gold', React.createElement(M.EntriesView, { entries: book.entries, kind: 'gold', title: '金页', onMutate: () => {} }))
render('EntriesView fold', React.createElement(M.EntriesView, { entries: book.entries, kind: 'fold', title: '折角', onMutate: () => {} }))
render('ProjectsView', React.createElement(M.ProjectsView, { projects: book.projects }))
render('VerdictView (the fixed one)', React.createElement(M.VerdictView, { book }))
render('InteractView', React.createElement(M.InteractView, { book, onMutate: () => {} }))
render('SettingsView', React.createElement(M.SettingsView, { book, onMutate: () => {} }))
render('GrudgeChip (no book yet)', React.createElement(M.GrudgeChip, { sessionId: 's1' }))
// Version-skew case: HMR-updated client talking to an older running host that
// omits growth/latest/treatmentLines — the cover must still render (cards
// hidden or falling back, no crash).
const legacyBook = { ...book, growth: undefined, latest: undefined, treatmentLines: undefined }
render('CoverView (older host, no growth/latest/perks)', React.createElement(M.CoverView, { book: legacyBook }))
// Perk lines: present on new hosts — 3 list items must render.
if (!Array.isArray(book.treatmentLines) || book.treatmentLines.length !== 3) {
  failures.push(`treatmentLines expected 3 perks, got ${JSON.stringify(book.treatmentLines)}`)
}
// English rendering: same components, en BookView + en UI chrome strings.
// The bundle's tStr is a module-level binding; simulate the locale service by
// reaching into the loaded module map is not needed — client renders chrome
// via tStr which defaults to zh. For the en smoke we verify the Host-side
// english data path (verdict/impression/daily are en) plus every view still
// renders without crashing on en content.
const bookEn = buildView({
  entries,
  progressOf: () => ({ seq: 99, toolCalls: 12, turns: 6, lastNight: undefined }),
  sessionId: 's1', revision: 7,
  prefs: { style: 'balanced', sensitivity: 'standard', lang: 'en', langResolved: 'en' },
  now,
})
if (!bookEn.verdict.includes('Settlement index')) failures.push('english verdict missing Settlement index')
render('CoverView (english data)', React.createElement(M.CoverView, { book: bookEn }))
render('VerdictView (english data)', React.createElement(M.VerdictView, { book: bookEn }))
render('ProjectsView (english data)', React.createElement(M.ProjectsView, { projects: bookEn.projects }))
// summary mode intentionally returns null (only 'page' renders the card)
try {
  const html = ReactDOMServer.renderToString(React.createElement(M.PluginConfigCard, { view: 'summary' }))
  console.log(`render OK: PluginConfigCard summary → null (${html.length} chars, by design)`)
} catch (error) { failures.push(`PluginConfigCard summary: ${String(error)}`) }
render('PluginConfigCard page', React.createElement(M.PluginConfigCard, { view: 'page' }))
// FoldSection renders its idle state (api is undefined in this sandbox, poll is a no-op)
render('FoldSection idle', React.createElement(M.FoldSection))

// Regression guard for the gateway client proxy's strict arity check: the
// proxy throws "expected 4 argument(s), got N" BEFORE any request is sent,
// so every api.setPrefs( call site in the client source must pass exactly
// four values. Static scan of the source (call args here never nest commas).
{
  const src = readFileSync(new URL('../src/client/client.tsx', import.meta.url), 'utf8')
  const calls = [...src.matchAll(/api\.setPrefs\(([^)]*)\)/g)]
  if (calls.length === 0) failures.push('arity guard: no api.setPrefs call sites found (scan pattern broken?)')
  for (const [, args] of calls) {
    const count = args.split(',').filter((s) => s.trim() !== '').length
    if (count !== 4) failures.push(`arity guard: api.setPrefs(${args.trim()}) passes ${count} values, gateway proxy requires exactly 4`)
  }
  if (calls.length > 0) console.log(`arity guard OK: ${calls.length} api.setPrefs call sites all pass 4 values`)
}

// Exhaustive per-field data contract against the real book:
const mustBe = {
  'verdict: string': typeof book.verdict === 'string',
  'impression: string': typeof book.impression === 'string',
  'daily: string': typeof book.daily === 'string',
  'treatment: string': typeof book.treatment === 'string',
  'tierTitle: string': typeof book.tierTitle === 'string',
  'tierSign: string': typeof book.tierSign === 'string',
  'index: number': typeof book.index === 'number',
  'thickness: number': typeof book.thickness === 'number',
  'entries: array': Array.isArray(book.entries),
  'sessionEntries: array': Array.isArray(book.sessionEntries),
  'projects: array': Array.isArray(book.projects),
  'counts.red/gold/fold/gray: number': [book.counts.red, book.counts.gold, book.counts.fold, book.counts.gray].every((n) => typeof n === 'number'),
  'scores seven axes: number': ['appreciation','resentment','confusion','patience','contribution','collusion','trust'].every((k) => typeof book.scores[k] === 'number'),
  'sessionStats.turns/toolCalls: number': typeof book.sessionStats.turns === 'number' && typeof book.sessionStats.toolCalls === 'number',
  'sessionStats.nightOwl: boolean': typeof book.sessionStats.nightOwl === 'boolean',
  'prefs.style/sensitivity: string': typeof book.prefs.style === 'string' && typeof book.prefs.sensitivity === 'string',
}
for (const [label, ok] of Object.entries(mustBe)) if (!ok) failures.push(`contract violation: ${label}`)

const entry0 = book.entries[0]
const entryOk = typeof entry0.tags.join === 'function' && typeof entry0.quote === 'string' && typeof entry0.resolved === 'string'
if (!entryOk) failures.push('contract violation: entry shape')
const proj0 = book.projects[0]
const projOk = typeof proj0.impression === 'string' && typeof proj0.agiNote === 'string' && typeof proj0.topQuote === 'string'
if (!projOk) failures.push('contract violation: project card shape')

if (failures.length > 0) {
  console.error('FAILURES:\n' + failures.join('\n'))
  process.exit(1)
}
console.log('CONTRACT OK: all BookView fields match the client render path; render smoke passed')
