export interface MoveRovingFocusOptions {
  /** Closest ancestor selector that bounds the roving set. */
  container: string;
  /** Selector for focusable items inside the container. */
  items: string;
}

/** DOM-derived roving focus movement, clamped at the list edges. */
export function moveRovingFocus(
  from: HTMLElement,
  delta: number,
  { container, items }: MoveRovingFocusOptions,
): void {
  const root = from.closest(container);
  if (!root) return;

  const candidates = Array.from(root.querySelectorAll<HTMLElement>(items));
  const at = candidates.indexOf(from);
  if (at === -1) return;

  candidates[Math.min(candidates.length - 1, Math.max(0, at + delta))]?.focus();
}
