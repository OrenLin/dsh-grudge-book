/**
 * Build orchestration for @local/grudge-book.
 *
 * 1. tsc compiles src/host + src/shared → lib/ (standard decorators included).
 * 2. esbuild bundles src/client/client.tsx → dist/client.js wrapped in the
 *    window.__ModuleLoader__.load factory envelope.
 *
 * Toolchain resolution order (first hit wins):
 *   1. this package's own node_modules/.bin (pnpm install → devDependencies)
 *   2. a DSH checkout derived from the node_modules/@deepseek-ai/* symlinks
 *      (dev workflow: symlinked peers point straight into the checkout)
 *   3. $DSH_ROOT pointing at a DeepSeek Harness checkout
 *   4. none → fail with instructions for both options
 */
import { spawnSync } from 'node:child_process'
import { accessSync, mkdirSync, readdirSync, constants } from 'node:fs'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const exists = (p) => {
  try {
    accessSync(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** DSH checkout roots worth trying: $DSH_ROOT + any root implied by symlinked peers. */
const dshRoots = []
if (process.env.DSH_ROOT !== undefined && process.env.DSH_ROOT !== '') dshRoots.push(process.env.DSH_ROOT)
try {
  // A dev checkout links node_modules/@deepseek-ai/cordis into the DSH repo;
  // walking up from the real path lands on the checkout that owns .bin/tsc.
  let dir = dirname(realpathSync(join(root, 'node_modules', '@deepseek-ai', 'cordis')))
  while (dir !== '/' && dir !== '.') {
    if (exists(join(dir, 'node_modules', '.bin', 'tsc'))) {
      dshRoots.push(dir)
      break
    }
    dir = dirname(dir)
  }
} catch {
  // no symlinked peer — external installs resolve via .pnpm; ignore
}

const toolchainHelp =
  'grudge-book: %s not found. Fix one of these ways:\n' +
  '  1. pnpm install        # installs devDependencies (typescript, esbuild)\n' +
  '  2. export DSH_ROOT=/path/to/deepseek-harness   # reuse a DSH checkout toolchain'

/** First existing binary across local node_modules and every DSH root. */
const resolveBin = (name) => {
  const candidates = [
    join(root, 'node_modules', '.bin', name),
    ...dshRoots.map((d) => join(d, 'node_modules', '.bin', name)),
  ]
  const hit = candidates.find(exists)
  if (hit === undefined) {
    console.error(toolchainHelp.replace('%s', name))
    process.exit(1)
  }
  return hit
}

mkdirSync(join(root, 'dist'), { recursive: true })

// --- 1. tsc ---------------------------------------------------------------
const tsc = spawnSync(resolveBin('tsc'), ['-p', join(root, 'tsconfig.json')], {
  stdio: 'inherit',
})
if (tsc.status !== 0) {
  console.error('grudge-book: tsc failed')
  process.exit(1)
}

// --- 2. esbuild -----------------------------------------------------------
const require = createRequire(import.meta.url)
const pnpmStore = (d) => {
  try {
    return readdirSync(join(d, 'node_modules', '.pnpm'))
      .filter((n) => n.startsWith('esbuild@'))
      .map((n) => join(d, 'node_modules', '.pnpm', n, 'node_modules', 'esbuild'))
  } catch {
    return []
  }
}
let esbuild
for (const candidate of [
  'esbuild',
  join(root, 'node_modules', 'esbuild'),
  ...dshRoots.flatMap((d) => [join(d, 'node_modules', 'esbuild'), ...pnpmStore(d)]),
]) {
  try {
    esbuild = require(candidate)
    break
  } catch {
    // try the next location
  }
}
if (esbuild === undefined) {
  console.error(toolchainHelp.replace('%s', 'esbuild'))
  process.exit(1)
}

const banner = 'window.__ModuleLoader__.load({ id: "@local/grudge-book", factory(require) { var module = { exports: {} }; var exports = module.exports;'
const footer = 'return module.exports; } });'

const result = await esbuild.build({
  entryPoints: [join(root, 'src/client/client.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  outfile: join(root, 'dist/client.js'),
  external: ['react', 'react/*'],
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  banner: { js: banner },
  footer: { js: footer },
  sourcemap: false,
  logLevel: 'info',
})
process.exit(result.errors.length > 0 ? 1 : 0)
