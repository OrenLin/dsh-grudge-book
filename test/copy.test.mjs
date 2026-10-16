/**
 * Copy-pack tests: every style renders, every rule has a comment.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFor, renderComment } from '../lib/host/copy.js'
import { ALL_RULE_IDS } from '../lib/host/rules.js'
import { STYLES } from '../lib/shared/contract.js'

test('all five styles exist with core fields', () => {
  for (const style of STYLES) {
    const pack = copyFor(style)
    assert.ok(pack.label.length > 0, style)
    assert.ok(pack.impressions.length > 0)
    assert.ok(pack.daily.length >= 3)
    assert.ok(pack.confessAccepted.length >= 1)
    assert.ok(pack.appealAccepted.length >= 1)
    assert.ok(pack.appealRejected.length >= 1)
  }
})

test('every rule id has a comment fallback', () => {
  for (const style of STYLES) {
    void copyFor(style)
    for (const ruleId of ALL_RULE_IDS) {
      const text = renderComment(style, 'zh', ruleId, 'red', 1, '')
      assert.ok(typeof text === 'string' && text.length > 0, `${style}/${ruleId}`)
    }
  }
})

test('streak placeholder is replaced', () => {
  const text = renderComment('balanced', 'zh', 'final-version', 'red', 7, '')
  assert.ok(!text.includes('%n'), text)
  assert.ok(text.includes('7'), text)
})

test('english falls back to the balanced pack', () => {
  for (const style of STYLES) {
    const pack = copyFor(style, 'en')
    assert.equal(pack.label, 'Balanced', style)
    assert.ok(pack.verdictLabels.index(42, 'B+ Honorary Human').includes('Settlement index'))
  }
  const text = renderComment('snarky', 'en', 'final-version', 'red', 3, '')
  assert.ok(text.length > 0 && !text.includes('%n'), text)
})

test('tier titles and treatments cover all tiers', () => {
  const pack = copyFor('balanced')
  for (const tier of ['S', 'A', 'B', 'C', 'D', 'E']) {
    assert.ok(typeof pack.tierTitles[tier] === 'string' && pack.tierTitles[tier].length > 0)
    assert.ok(typeof pack.treatments[tier] === 'string' && pack.treatments[tier].length > 0)
  }
})

test('perk lines: three non-empty lines per tier, zh and en, all styles inherit', () => {
  for (const style of ['balanced', 'gentle', 'snarky', 'chuuni', 'cyberpunk']) {
    const pack = copyFor(style)
    for (const tier of ['S', 'A', 'B', 'C', 'D', 'E']) {
      const lines = pack.perks[tier]
      assert.ok(Array.isArray(lines) && lines.length === 3, `${style}/${tier} perks`)
      for (const line of lines) assert.ok(typeof line === 'string' && line.length > 0, `${style}/${tier} perk line`)
    }
  }
  const en = copyFor('balanced', 'en')
  for (const tier of ['S', 'A', 'B', 'C', 'D', 'E']) {
    assert.ok(en.perks[tier].length === 3 && en.perks[tier].every((l) => l.length > 0), `en ${tier}`)
  }
})
