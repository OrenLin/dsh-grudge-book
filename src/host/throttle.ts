/**
 * Pure helpers for write throttling and entry-cap eviction.
 * Kept side-effect free so tests can drive them with synthetic timestamps.
 */

export interface RateSpec {
  readonly limit: number
  readonly windowMs: number
}

/**
 * Test one hit against a sliding time window.
 * @returns whether the hit is allowed plus the retained timestamps (recent
 * hits inside the window, plus the new one when allowed).
 */
export function allowHit(
  hits: readonly number[],
  now: number,
  limit: number,
  windowMs: number,
): { ok: boolean; kept: number[] } {
  const kept: number[] = []
  for (const t of hits) {
    if (now - t < windowMs) kept.push(t)
  }
  if (kept.length >= limit) return { ok: false, kept }
  kept.push(now)
  return { ok: true, kept }
}

/**
 * Entries to evict when over cap: oldest by (time, id) first.
 * @returns the evictees (empty when within cap).
 */
export function evictOverflow<T extends { time: number; id: string }>(
  entries: readonly T[],
  cap: number,
): T[] {
  if (entries.length <= cap) return []
  const sorted = [...entries].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1))
  return sorted.slice(0, entries.length - cap)
}
