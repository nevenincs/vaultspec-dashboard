// Adverse-condition test harness (dashboard-optimization W01): generators and
// drivers to REPRODUCE request/render storms and unbounded growth before they
// are fixed, and to keep them fixed (regression nets) as features expand. This
// module is vitest-free on purpose so it imports cleanly anywhere; tests own the
// assertions and timer control. `assertBounded` throws a plain Error (which a
// test runner reports as a failure) so it needs no test framework either.

import type { GraphDeltaEntry } from "../stores/server/engine";

/**
 * N synthetic graph deltas with monotonic seq (and timestamp), for storm and
 * bounded-growth tests. Mixes `add`/`change` ops so dedup and apply paths are
 * both exercised; node ids are stable per seq so a replay re-sends the same seq.
 */
export function syntheticGraphDeltas(count: number, startSeq = 1): GraphDeltaEntry[] {
  const deltas: GraphDeltaEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const seq = startSeq + i;
    deltas.push({
      op: i % 5 === 0 ? "change" : "add",
      node: { id: `doc:storm-${seq}`, kind: "document" },
      t: seq,
      seq,
    });
  }
  return deltas;
}

/** Run `op` `count` times - a generic storm driver. */
export function storm(count: number, op: (index: number) => void): void {
  for (let i = 0; i < count; i += 1) op(i);
}

/**
 * Assert a measured size stays at or below `max`. Throws on violation so any
 * test runner reports it; framework-free. Use after a storm to pin that an
 * accumulator (delta log, stream reducer, cache) stayed bounded.
 */
export function assertBounded(actual: number, max: number, label = "size"): void {
  if (actual > max) {
    throw new Error(
      `bounded-growth violation: ${label} = ${actual} exceeds cap ${max}`,
    );
  }
}
