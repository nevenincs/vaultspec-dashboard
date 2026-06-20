import type { RefObject } from "react";
import { useEffect } from "react";

export interface DismissOnOutsidePointerOptions {
  /** Gate the listener — when false, no listener is attached (default true). */
  enabled?: unknown;
  /**
   * The document the listener attaches to. Defaults to `document` when present,
   * which matches popover/light-dismiss surfaces.
   */
  target?: Document;
  /**
   * A pointer landing inside an element matching this CSS selector does NOT
   * dismiss — for a popover whose TRIGGER lives outside its root (e.g. a toolbar
   * "Filter ▾" button). The external trigger owns its own open/close, so the
   * light-dismiss must skip it or the two fight (dismiss-then-reopen). Omit when
   * the trigger is nested inside `rootRef` (the common case).
   */
  ignoreSelector?: unknown;
}

export function normalizeDismissOnOutsidePointerEnabled(value: unknown): boolean {
  return value === undefined ? true : value === true;
}

export function normalizeDismissOnOutsidePointerIgnoreSelector(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isInsideIgnoredDismissTarget(
  node: HTMLElement | null,
  selector: string | null,
): boolean {
  if (node === null || selector === null) return false;
  try {
    return node.closest(selector) !== null;
  } catch {
    return false;
  }
}

/**
 * Attach a document-level pointer listener that calls `onDismiss()` when the
 * pointer lands outside `rootRef`. The caller owns open state and dismiss
 * semantics; this hook owns only the shared light-dismiss listener wiring.
 */
export function useDismissOnOutsidePointer<T extends HTMLElement>(
  rootRef: RefObject<T | null>,
  onDismiss: () => void,
  options: DismissOnOutsidePointerOptions = {},
): void {
  const { enabled = true, target = globalThis.document, ignoreSelector } = options;
  const normalizedEnabled = normalizeDismissOnOutsidePointerEnabled(enabled);
  const normalizedIgnoreSelector =
    normalizeDismissOnOutsidePointerIgnoreSelector(ignoreSelector);

  useEffect(() => {
    if (!normalizedEnabled || !target) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const node = event.target as HTMLElement | null;
      if (!root || root.contains(node as Node)) return;
      if (isInsideIgnoredDismissTarget(node, normalizedIgnoreSelector)) return;
      onDismiss();
    };

    target.addEventListener("pointerdown", onPointerDown);
    return () => target.removeEventListener("pointerdown", onPointerDown);
  }, [normalizedEnabled, onDismiss, rootRef, target, normalizedIgnoreSelector]);
}
