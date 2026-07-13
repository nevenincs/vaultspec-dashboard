// Trailing-edge debounce (dashboard-optimization ADR D2b): collapse a burst of
// calls into a single trailing invocation, so stream-driven cache invalidation
// does not storm (P-HIGH-1/2). A framework-free substrate timing primitive; the
// returned function carries `cancel()` for effect teardown.

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Cancel a pending trailing call (call on unmount / effect cleanup). */
  cancel(): void;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const debounced = ((...args: A): void => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const args = lastArgs;
      lastArgs = null;
      if (args) fn(...args);
    }, waitMs);
  }) as Debounced<A>;

  debounced.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  return debounced;
}

// Leading+trailing throttle / cooldown floor (graph-slice-delta ADR D1): fire the
// FIRST call immediately, then at most once per `waitMs`, with a single TRAILING
// call carrying the latest args so the final state always lands. Unlike `debounce`,
// which delays every call, this bounds the RATE while still landing promptly on the
// leading edge — the shape a refetch-storm floor needs (sustained churn spaces full
// sweeps out; the final sweep still runs). Carries `cancel()` for effect teardown.
export function throttleTrailing<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;
  // -Infinity so the first call always clears the cooldown and fires the leading edge.
  let lastFire = Number.NEGATIVE_INFINITY;

  const throttled = ((...args: A): void => {
    const now = Date.now();
    const remaining = waitMs - (now - lastFire);
    if (remaining <= 0) {
      // Cooldown elapsed → fire the leading edge now.
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      lastArgs = null;
      lastFire = now;
      fn(...args);
      return;
    }
    // Within the cooldown → schedule the single trailing call (refresh its args).
    lastArgs = args;
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        lastFire = Date.now();
        const trailing = lastArgs;
        lastArgs = null;
        if (trailing) fn(...trailing);
      }, remaining);
    }
  }) as Debounced<A>;

  throttled.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  return throttled;
}
