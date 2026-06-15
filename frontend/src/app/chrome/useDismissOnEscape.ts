// Shared Escape-to-dismiss listener hook (codebase-centralisation F-S2).
//
// Roughly a dozen chrome surfaces (the modal Dialog, the layout panel, the
// discover panel, the filter sidebar, …) each reimplemented the same keydown
// listener skeleton: attach a `keydown` handler, dismiss on `Escape`, clean up
// on unmount, and gate the whole thing on an open/visible flag. This is the
// single home for THAT wiring — and only that. Each caller keeps its OWN dismiss
// action as the `onDismiss` callback; the hook never unifies what "dismiss"
// means, only when and how the listener is attached.
//
// The event target and phase match the in-repo convention for these surfaces
// (window-level keydown, bubble phase). The optional `preventDefault` mirrors
// the one surface (the modal Dialog) that calls it before dismissing; the
// default is false so the listener-only surfaces keep their exact behaviour.

import { useEffect } from "react";

export interface DismissOnEscapeOptions {
  /** Gate the listener — when false, no listener is attached (default true). */
  enabled?: boolean;
  /**
   * The element the listener attaches to. Defaults to `window`, matching the
   * convention of the surfaces this consolidates; the modal Dialog passes
   * `document`, where its Escape handler historically lived.
   */
  target?: Window | Document;
  /** Call `preventDefault()` on the Escape event before dismissing (default false). */
  preventDefault?: boolean;
}

/**
 * Attach a keydown listener that calls `onDismiss()` on Escape and cleans up on
 * unmount. `enabled` gates the listener so a caller that only listens while a
 * surface is open keeps that behaviour. The listener-wiring is all this owns:
 * the caller's `onDismiss` is the only thing that decides what dismissal does.
 */
export function useDismissOnEscape(
  onDismiss: () => void,
  options: DismissOnEscapeOptions = {},
): void {
  const { enabled = true, target = window, preventDefault = false } = options;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (preventDefault) e.preventDefault();
        onDismiss();
      }
    };
    target.addEventListener("keydown", onKey as EventListener);
    return () => target.removeEventListener("keydown", onKey as EventListener);
  }, [enabled, target, preventDefault, onDismiss]);
}
