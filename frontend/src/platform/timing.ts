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
