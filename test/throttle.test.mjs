import test from 'node:test'
import assert from 'node:assert/strict'
import { allowHit, evictOverflow } from '../src/host/throttle.ts'

const MIN = 60_000

test('allowHit passes under the limit', () => {
  const r1 = allowHit([], 1_000, 3, MIN)
  assert.equal(r1.ok, true)
  assert.deepEqual(r1.kept, [1_000])

  const r2 = allowHit(r1.kept, 2_000, 3, MIN)
  assert.equal(r2.ok, true)
  assert.deepEqual(r2.kept, [1_000, 2_000])

  const r3 = allowHit(r2.kept, 3_000, 3, MIN)
  assert.equal(r3.ok, true)
  assert.deepEqual(r3.kept, [1_000, 2_000, 3_000])
})

test('allowHit blocks at the limit and keeps window state', () => {
  const r = allowHit([1_000, 2_000, 3_000], 4_000, 3, MIN)
  assert.equal(r.ok, false)
  assert.deepEqual(r.kept, [1_000, 2_000, 3_000])
})

test('allowHit drops timestamps that slid out of the window', () => {
  // 1_000 is 61s old → outside a 60s window
  const r = allowHit([1_000, 50_000], 61_000, 3, MIN)
  assert.equal(r.ok, true)
  assert.deepEqual(r.kept, [50_000, 61_000])
})

test('allowHit recovers after the window drains', () => {
  const full = [1_000, 2_000, 3_000]
  const blocked = allowHit(full, 4_000, 3, MIN)
  assert.equal(blocked.ok, false)
  // at t=61_500 the 1_000 hit slid out (60.5s old) but 2_000/3_000 remain
  const later = allowHit(blocked.kept, 61_500, 3, MIN)
  assert.equal(later.ok, true)
  assert.deepEqual(later.kept, [2_000, 3_000, 61_500])
})

test('evictOverflow returns nothing under cap', () => {
  const entries = [
    { id: 'a', time: 1 },
    { id: 'b', time: 2 },
  ]
  assert.deepEqual(evictOverflow(entries, 2), [])
  assert.deepEqual(evictOverflow(entries, 5), [])
})

test('evictOverflow evicts oldest first, ties broken by id', () => {
  const entries = [
    { id: 'new-a', time: 300 },
    { id: 'old-b', time: 100 },
    { id: 'tie-z', time: 100 },
    { id: 'tie-a', time: 100 },
    { id: 'mid-c', time: 200 },
  ]
  // cap 3 → evict the 2 oldest: both at t=100, 'tie-a' < 'tie-z'
  const evicted = evictOverflow(entries, 3)
  assert.deepEqual(evicted.map((e) => e.id), ['old-b', 'tie-a'])
})

test('evictOverflow does not mutate the input array', () => {
  const entries = [
    { id: 'a', time: 2 },
    { id: 'b', time: 1 },
    { id: 'c', time: 3 },
  ]
  const snapshot = [...entries]
  evictOverflow(entries, 1)
  assert.deepEqual(entries, snapshot)
})
