/**
 * Post-build sanity checks for the grudge-book bundle.
 * Exit 0 = bundle shape looks installable.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const problems = []

function check(condition, message) {
  if (!condition) problems.push(message)
}

// --- manifest --------------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check(pkg.name === '@local/grudge-book', 'package name')
check(pkg.type === 'module', 'package type module')
for (const [key, target] of Object.entries(pkg.exports)) {
  if (typeof target !== 'string') continue
  if (target.includes('*')) {
    // Glob export: verify the pattern's directory exists and matches ≥1 file.
    const dir = join(root, dirname(target))
    const pattern = basename(target).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    const re = new RegExp(`^${pattern}$`)
    const { readdirSync } = await import('node:fs')
    check(
      existsSync(dir) && readdirSync(dir).some((f) => re.test(f)),
      `exports "${key}" → ${target} matches nothing`,
    )
  } else {
    check(existsSync(join(root, target)), `exports "${key}" → ${target} missing`)
  }
}
check(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch')
check(Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0, 'dsh.client.inject')

// --- patch -----------------------------------------------------------------
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
check(patch.includes("'@local/grudge-book'"), 'patch names the bundle')

// --- built artifacts ---------------------------------------------------------
check(existsSync(join(root, 'lib/host/index.js')), 'lib/host/index.js built')
check(existsSync(join(root, 'lib/host/service.js')), 'lib/host/service.js built')
const client = readFileSync(join(root, 'dist/client.js'), 'utf8')
check(client.startsWith('window.__ModuleLoader__.load({'), 'client wrapper banner')
check(client.trimEnd().endsWith('return module.exports; } });'), 'client wrapper footer')
check(client.includes('grudgeBook'), 'client references the service')
check(!client.includes('from "react"'), 'react must stay external')

// --- locale + icon ----------------------------------------------------------
for (const locale of ['en.json', 'zh-CN.json']) {
  const dict = JSON.parse(readFileSync(join(root, 'locale', locale), 'utf8'))
  check(typeof dict.meta?.title === 'string' && dict.meta.title.length > 0, `locale ${locale} meta.title`)
  check(typeof dict.meta?.description === 'string', `locale ${locale} meta.description`)
}
const iconSize = statSync(join(root, 'icon.svg')).size
check(iconSize <= 256 * 1024, `icon.svg ${iconSize}B ≤ 256KiB`)

if (problems.length > 0) {
  console.error('grudge-book verify FAILED:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('grudge-book verify OK: manifest, patch, host lib, client bundle, locale, icon all present.')
