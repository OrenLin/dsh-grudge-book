/**
 * Aggregation tests for the grudge book. Run: node --test test/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveScores, tierOf, verdictIndex, buildView } from '../lib/host/aggregate.js'

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)
const DAY = 86_400_000

function entry(overrides = {}) {
  return {
    id: 's:1:x', sessionId: 's', seq: 1, time: NOW - DAY, kind: 'red', ruleId: 'final-version',
    title: 't', quote: 'q', aiComment: 'c', tags: [], deltas: { resentment: 8 },
    severity: 2, project: 'p', streak: 1, resolved: 'none',
    ...overrides,
  }
}

test('scores decay with half-life', () => {
  const fresh = effectiveScores([entry({ deltas: { resentment: 10 } })], NOW)
  const old = effectiveScores([entry({ deltas: { resentment: 10 }, time: NOW - 14 * DAY })], NOW)
  assert.ok(old.resentment < fresh.resentment)
  // 14-day half-life: one half-life later ≈ half strength
  assert.ok(Math.abs(old.resentment - 5) < 0.5, `expected ~5, got ${old.resentment}`)
})

test('repeat red entries are damped per session', () => {
  const once = effectiveScores([entry({ deltas: { resentment: 10 } })], NOW)
  const thrice = effectiveScores([
    entry({ deltas: { resentment: 10 } }),
    entry({ id: 's:2:x', seq: 2, deltas: { resentment: 10 }, streak: 2 }),
    entry({ id: 's:3:x', seq: 3, deltas: { resentment: 10 }, streak: 3 }),
  ], NOW)
  assert.ok(thrice.resentment > once.resentment)
  assert.ok(thrice.resentment < 3 * once.resentment, 'damping must cap repeat growth')
})

test('confessed entries count half', () => {
  const live = effectiveScores([entry({ deltas: { resentment: 10 } })], NOW)
  const confessed = effectiveScores([entry({ deltas: { resentment: 10 }, resolved: 'confessed' })], NOW)
  assert.ok(confessed.resentment < live.resentment)
})

test('gold entries feed appreciation', () => {
  const scores = effectiveScores([entry({ kind: 'gold', deltas: { appreciation: 10 } })], NOW)
  assert.ok(scores.appreciation >= 9)
})

const ZERO_SCORES = {
  appreciation: 0, resentment: 0, confusion: 0, patience: 0, contribution: 0, collusion: 0, trust: 0,
}

test('verdict index maps to 0-100', () => {
  const neutral = verdictIndex(ZERO_SCORES)
  assert.ok(neutral >= 35 && neutral <= 65, `neutral ${neutral}`)
  assert.ok(verdictIndex({ ...ZERO_SCORES, appreciation: 200 }) > 80)
  assert.ok(verdictIndex({ ...ZERO_SCORES, resentment: 200 }) < 35)
})

test('tiers split at thresholds and E is the collusion easter egg', () => {
  assert.equal(tierOf(85, 0), 'S')
  assert.equal(tierOf(70, 0), 'A')
  assert.equal(tierOf(55, 0), 'B')
  assert.equal(tierOf(40, 0), 'C')
  assert.equal(tierOf(10, 0), 'D')
  assert.equal(tierOf(40, 45), 'E')
})

test('buildView produces a complete notebook', () => {
  const view = buildView({
    entries: [
      entry({ ruleId: 'final-version', kind: 'red', time: NOW - DAY, project: 'alpha' }),
      entry({ id: 's:2:thanks', seq: 2, kind: 'gold', ruleId: 'thanks', deltas: { appreciation: 6 }, time: NOW - DAY, project: 'alpha' }),
      entry({ id: 's:3:youknow', seq: 3, kind: 'fold', ruleId: 'youknow', deltas: {}, quote: '你懂我意思吧', time: NOW - 2 * DAY, project: 'alpha' }),
    ],
    progressOf: () => ({ seq: 3, toolCalls: 12, turns: 2 }),
    sessionId: 's',
    revision: 1,
    prefs: { style: 'balanced', sensitivity: 'standard' },
    now: NOW,
  })
  assert.equal(view.thickness, 3)
  assert.equal(view.counts.red, 1)
  assert.equal(view.counts.gold, 1)
  assert.equal(view.counts.fold, 1)
  assert.equal(view.projects.length, 1)
  assert.equal(view.projects[0].name, 'alpha')
  assert.equal(view.sessionEntries.length, 3)
  assert.ok(typeof view.impression === 'string' && view.impression.length > 0)
  assert.ok(typeof view.daily === 'string' && view.daily.length > 0)
  assert.ok(typeof view.verdict === 'string' && view.verdict.includes('清算指数') && view.verdict.includes('纯属娱乐'))
  assert.ok(['S', 'A', 'B', 'C', 'D', 'E'].includes(view.tier))
  // growth: all three entries fall inside the 7-day window
  assert.equal(view.growth.weekPages, 3)
  assert.equal(view.growth.dayBars.length, 7)
  const barSum = view.growth.dayBars.reduce((n, d) => n + d.red + d.gold + d.fold, 0)
  assert.equal(barSum, 3)
  // latest = newest entry snapshot
  assert.ok(view.latest !== null)
  assert.ok(typeof view.latest.title === 'string' && view.latest.title.length > 0)
  assert.ok(typeof view.latest.quote === 'string')
  assert.ok(['red', 'gold', 'fold'].includes(view.latest.kind))
})

test('buildView caps entries at 200 and orders newest first', () => {
  const many = Array.from({ length: 260 }, (_, i) =>
    entry({ id: `s:${i}:x`, seq: i, time: NOW - i * 1000, deltas: { appreciation: 1 } }))
  const view = buildView({
    entries: many, progressOf: () => undefined, sessionId: 's', revision: 1,
    prefs: { style: 'balanced', sensitivity: 'standard' }, now: NOW,
  })
  assert.equal(view.entries.length, 200)
  assert.ok(view.entries[0].time >= view.entries[1].time)
})

test('buildView renders an english verdict when langResolved is en', () => {
  const view = buildView({
    entries: [entry({ ruleId: 'final-version', kind: 'red', deltas: { resentment: 8 }, project: 'alpha' })],
    progressOf: () => ({ seq: 1, toolCalls: 0, turns: 1 }),
    sessionId: 's',
    revision: 1,
    prefs: { style: 'balanced', sensitivity: 'standard', lang: 'en', langResolved: 'en' },
    now: NOW,
  })
  assert.ok(view.verdict.includes('Settlement index'), view.verdict)
  assert.ok(view.verdict.includes('Human user #'), view.verdict)
  assert.ok(!view.verdict.includes('清算指数'), view.verdict)
})

// ------------------------------------------------------- quiet (score-only)
test('quiet entries score but never display', () => {
  const mk = (id, ruleId, deltas, extra = {}) => ({
    id, sessionId: 's1', seq: 1, time: NOW - 3_600_000, kind: 'gold',
    ruleId, title: 't', quote: 'q', aiComment: 'c', tags: [], deltas,
    severity: 0, project: '/p', streak: 1, resolved: 'none', ...extra,
  })
  const entries = [
    mk('a', 'churn', { collusion: 2, trust: 1 }),
    mk('b', 'churn', { collusion: 2, trust: 1 }, { quiet: true }),
    mk('c', 'churn', { collusion: 2, trust: 1 }, { quiet: true }),
    mk('d', 'thanks', { appreciation: 6, trust: 1 }),
  ]
  const view = buildView({
    entries,
    progressOf: () => ({ seq: 9, toolCalls: 0, turns: 0, lastNight: undefined }),
    sessionId: 's1', revision: 1,
    prefs: { style: 'balanced', sensitivity: 'standard', lang: 'auto', langResolved: 'zh' },
    now: NOW,
  })
  // display: only the two visible entries
  assert.equal(view.thickness, 2)
  assert.equal(view.entries.length, 2)
  assert.ok(!view.entries.some((e) => e.quiet === true))
  assert.equal(view.counts.gold, 2) // one churn + one thanks, quiet churn hidden
  // scores: all three churn entries contribute collusion
  assert.equal(view.scores.collusion, 6)
})
