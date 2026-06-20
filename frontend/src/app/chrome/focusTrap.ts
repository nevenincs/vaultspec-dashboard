export const FOCUSABLE_SELECTOR =
  "a[href], button, input, select, textarea, [tabindex]";

export interface FocusTrapKeyEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
}

/**
 * Tab-order descendants of a container, in DOM order. Excludes disabled controls
 * and programmatic-only `tabindex="-1"` elements.
 */
export function focusableDescendants(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.hasAttribute("disabled")) return false;
      if (el.getAttribute("tabindex") === "-1") return false;
      return true;
    },
  );
}

/**
 * Trap Tab / Shift+Tab within `root`. Returns true when the key event belonged to
 * the trap, even if no wrap was needed.
 */
export function trapTabFocus(
  root: HTMLElement | null,
  event: FocusTrapKeyEvent,
): boolean {
  if (event.key !== "Tab" || !root) return false;

  const focusables = focusableDescendants(root);
  if (focusables.length === 0) {
    event.preventDefault();
    return true;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const activeEl = document.activeElement;
  if (event.shiftKey && activeEl === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeEl === last) {
    event.preventDefault();
    first.focus();
  }
  return true;
}
