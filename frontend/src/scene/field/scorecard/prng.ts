// Seeded deterministic PRNG and shared sampling helpers for the scorecard
// ground-truth generators (graph-viz-scorecard ADR, W01.P01.S01).
//
// The scorecard's CI gate is byte-reproducible by contract (ADR "Determinism for
// CI"): every generator and every gating metric draws randomness ONLY from a
// seeded PRNG, never from `Math.random` — a non-deterministic source cannot fence
// a regression. This module is that single source: a mulberry32 generator (small,
// fast, well-distributed for fixtures), Gaussian sampling via Box-Muller over it,
// a deterministic Fisher-Yates shuffle, and a stable tie-break comparator so float
// ties resolve by index, not by an unstable sort.
//
// All randomness is threaded through an explicit `Prng` instance — there is no
// module-level global state, so two runs from the same seed produce identical
// streams regardless of call order elsewhere.

/**
 * A seeded pseudo-random generator. Stateful (each `next()` advances the stream);
 * construct a fresh instance from the same seed to replay an identical sequence.
 */
export interface Prng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number;
  /** A Gaussian sample with the given mean and standard deviation. */
  gaussian(mean?: number, std?: number): number;
}

/**
 * mulberry32 — a 32-bit seeded PRNG. Deterministic, dependency-free, and
 * sufficient for fixture generation. The seed is coerced to a uint32; any finite
 * number is a valid seed.
 */
export function makePrng(seed: number): Prng {
  // Coerce to a non-zero uint32 state. A zero seed degenerates mulberry32, so we
  // offset it deterministically.
  let state = seed >>> 0 || 0x9e3779b9;

  // A spare Gaussian sample from Box-Muller's paired output, consumed before a
  // fresh pair is drawn (halves the trig cost without affecting determinism).
  let spare: number | null = null;

  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (min: number, max: number): number => {
    if (max < min) throw new Error(`makePrng.nextInt: max ${max} < min ${min}`);
    return min + Math.floor(next() * (max - min + 1));
  };

  const gaussian = (mean = 0, std = 1): number => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return mean + std * value;
    }
    // Box-Muller: two uniforms -> two independent standard normals. Guard u1
    // away from 0 so log is finite.
    let u1 = next();
    const u2 = next();
    if (u1 < 1e-12) u1 = 1e-12;
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    spare = z1;
    return mean + std * z0;
  };

  return { next, nextInt, gaussian };
}

/**
 * A deterministic Fisher-Yates shuffle drawing swaps from `prng`. Returns a new
 * array; the input is not mutated. Two runs with PRNGs at the same seed/position
 * produce identical orderings.
 */
export function shuffle<T>(array: readonly T[], prng: Prng): T[] {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = prng.nextInt(0, i);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * A stable comparator for float ranking: compare by value, breaking exact ties by
 * the accompanying index so a sort is deterministic across runs and platforms. A
 * bare numeric comparator leaves tied elements in engine-defined order; this fixes
 * the order to the index, which is the determinism the gate depends on.
 */
export function stableTieBreak(
  a: { value: number; index: number },
  b: { value: number; index: number },
): number {
  if (a.value < b.value) return -1;
  if (a.value > b.value) return 1;
  return a.index - b.index;
}
