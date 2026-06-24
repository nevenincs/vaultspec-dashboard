import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** The keys a browser uses to scroll a focused overflow region. */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

/**
 * Keep a focusable read-only scroll region keyboard-scrollable. The one global
 * keymap dispatcher binds the bare arrows (graph feature/neighbour cycling) on a
 * window listener and `preventDefault`s them — which on a focused viewer would
 * BOTH block the native scroll the tab stop exists for AND walk the graph.
 * Stopping propagation for the scroll keys (without preventing default) lets the
 * browser scroll the region while the dispatcher never sees the key — the Class-B
 * widget-key isolation every roving surface applies (keyboard-navigation S19; the
 * `every-composite-navigates-through-the-one-focuszone` rule).
 */
export function stopScrollKeyPropagation(event: ReactKeyboardEvent<HTMLElement>): void {
  if (SCROLL_KEYS.has(event.key)) event.stopPropagation();
}
