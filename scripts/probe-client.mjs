// Simulate the browser ModuleLoader + Cordis client context, run the built
// client bundle end-to-end, and report every registration it performs.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8')

const registrations = []
const effects = []
let applyError

// Minimal React stub: component bodies only run when rendered, so import-time
// only needs createElement/Fragment symbols to exist.
const React = {
  createElement: (...args) => ({ type: args[0], props: args[1] ?? {}, children: args.slice(2) }),
  Fragment: Symbol.for('react.fragment'),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
}
const require = (id) => {
  if (id === 'react' || id.startsWith('react/')) return React
  throw new Error('unexpected require: ' + id)
}

let capturedModule
const loader = {
  load(entry) {
    capturedModule = entry.factory(require)
  },
}

const registeredTabs = []
const slotInjects = []
const localeRegisters = []
const ctx = {
  remote: {
    $mount: async (contribution) => {
      registrations.push(`$mount(${contribution.package}, ${contribution.descriptors.length} descriptors)`)
      return async () => {}
    },
  },
  get: (key) => {
    if (key === 'remote.grudgeBook') {
      return new Proxy({}, { get: (_t, method) => async () => ({ ok: true, value: undefined }) })
    }
    return undefined
  },
  locale: {
    register: (ns, dicts) => { localeRegisters.push(ns); return () => {} },
    bind: () => () => 'ok',
  },
  sidebarRightTabs: {
    register: (def) => { registeredTabs.push(def); return () => {} },
  },
  sidebarRight: {
    commandTarget: () => ({ sessionId: 'probe' }),
    openTabFromTarget: () => {},
  },
  slots: {
    inject: (key, cb) => {
      slotInjects.push(key)
      try { cb() } catch (error) { console.log(`  slots.inject(${key}) callback THREW:`, String(error)) }
      return () => {}
    },
  },
  // Real cordis ctx.effect invokes the callback synchronously and keeps the
  // returned disposer; mirror that so registrations actually run.
  effect: (cb, label) => {
    let dispose
    try { dispose = cb() } catch (error) { console.log(`  effect(${label}) THREW:`, String(error)) }
    return typeof dispose === 'function' ? dispose : () => {}
  },
}

const sandbox = {
  window: { __ModuleLoader__: loader },
  document: {
    createElement: () => ({ style: {}, set textContent(v) { this._t = v }, get textContent() { return this._t } }),
    head: { append: () => {} },
  },
  console,
  setTimeout,
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
}
vm.createContext(sandbox)

try {
  vm.runInContext(code, sandbox, { filename: 'client.js' })
} catch (error) {
  console.error('LOAD THREW:', error)
  process.exit(1)
}

if (!capturedModule || typeof capturedModule.apply !== 'function') {
  // Mirror the vendored Loader's unwrapExports (vendor/loader/src/index.ts:202):
  // exports.default ?? exports, then again when __esModule. esbuild CJS output
  // wraps `export default module` into exports.default.
  const unwrapped = capturedModule?.default ?? capturedModule
  if (typeof unwrapped?.apply !== 'function') {
    console.error('MODULE SHAPE BAD after unwrap:', Object.keys(unwrapped ?? {}))
    process.exit(1)
  }
  console.log('raw export keys:', Object.keys(capturedModule))
  console.log('unwrapped via exports.default (vendored Loader behavior)')
  capturedModule = unwrapped
}
console.log('module.inject =', JSON.stringify(capturedModule.inject))

try {
  await capturedModule.apply(ctx)
} catch (error) {
  applyError = error
}

console.log('apply error:', applyError ? String(applyError.stack ?? applyError) : 'none')
console.log('registrations:', JSON.stringify(registrations))
console.log('tabs:', registeredTabs.map((t) => `${t.id} kind=${t.kind} guide=${t.guide?.length ?? 0}`))
console.log('slot injects:', slotInjects)
console.log('locale ns:', localeRegisters)
console.log('slot effect registrations (from inject callbacks):')
for (const e of effects) {
  if (typeof e === 'function') {
    try { e() } catch (error) { console.log('  inject callback THREW:', String(error)) }
  }
}
const bad = applyError !== undefined
console.log(bad ? 'PROBE FAILED' : 'PROBE OK: client module registers everything when services exist')
process.exit(bad ? 1 : 0)
