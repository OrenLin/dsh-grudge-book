/**
 * Release security gate for grudge-book.
 *
 * Scans the files that would actually be pushed (respects .gitignore when
 * run with --staged, or scans the working tree by default) for:
 *   1. personal paths / identifiers (must never leak into a public repo)
 *   2. secret-looking assignments or key material
 *   3. network calls in source (the plugin promises: fully local, no uploads)
 *
 * Exit 0 = clean, exit 1 = blocked with a report.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const staged = process.argv.includes('--staged')

/** Collect files: staged (what git would push) or working tree minus ignores. */
const listFiles = () => {
  if (staged) {
    return execSync('git ls-files', { cwd: root, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s !== '')
  }
  const skip = new Set(['node_modules', '.git', 'lib', 'dist', '.DS_Store'])
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (!name.endsWith('.tsbuildinfo') && !name.endsWith('.log')) out.push(p)
    }
  }
  walk(root)
  return out
}

const rules = [
  {
    id: 'personal-path',
    severity: 'block',
    // Absolute home paths of the author's machines, personal checkout
    // locations, or the author's local handle. Generic example paths
    // ("/Users/you/...") are intentionally fine.
    pattern: /\/Users\/sen(\/|\s|$|["'])|Desktop\/trae|harness \u9879\u76ee|(^|[^a-z])sen@/i,
    files: null, // everywhere
  },
  {
    id: 'secret-assignment',
    severity: 'block',
    pattern: /(api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*['"][^'"]{8,}/i,
    files: null,
  },
  {
    id: 'key-material',
    severity: 'block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}/,
    files: null,
  },
  {
    // Source code must not reach the network: the privacy promise is "fully
    // local, no uploads". Docs may reference URLs (repo itself, pnpm docs).
    id: 'network-call',
    severity: 'block',
    pattern: /\bfetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket|sendBeacon|navigator\.onLine|\baxios\b|https?:\/\/(?!github\.com\/OrenLin|registry\.npmmirror|pnpm\.io|localhost)/,
    files: /\.(ts|tsx|mjs|js|json|yml|yaml)$/,
    sourceOnly: true,
  },
]

const findings = []
for (const file of listFiles()) {
  const rel = relative(root, file)
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  for (const rule of rules) {
    if (rule.files !== null && !rule.files.test(rel.split('/').pop())) continue
    if (rule.sourceOnly && !/^(src|scripts|test|cordis\.patch\.yml)/.test(rel)) continue
    // The scanner's own source carries pattern literals ("sen@", "sendBeacon",
    // …) that would always self-match. Secrets rules still scan this file.
    if (rel === join('scripts', 'release-scan.mjs') && (rule.id === 'personal-path' || rule.id === 'network-call')) continue
    const m = rule.pattern.exec(text)
    if (m !== null) {
      const line = text.slice(0, m.index).split('\n').length
      findings.push(`${rel}:${line} [${rule.id}] ${JSON.stringify(m[0].slice(0, 60))}`)
    }
  }
}

if (findings.length > 0) {
  console.error(`release-scan: BLOCKED — ${findings.length} finding(s):`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`release-scan: clean (${staged ? 'staged tree' : 'working tree'})`)
