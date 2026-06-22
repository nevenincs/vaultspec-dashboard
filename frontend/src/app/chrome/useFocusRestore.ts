import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export interface FocusRestoreOptions {
  /** Runs immediately after focus is captured on the open edge. */
  onOpen?: () => void;
  /** Runs before focus is restored on the close edge. */
  onClose?: () => void;
  /** Explicit return target. When provided, focus restores to THIS element on
   *  close/unmount instead of the captured open-time `activeElement` — for a
   *  surface that opens via a path where the open-time focus is NOT its invoker
   *  (an `ArrowDown`-dive into a row, a default-open seam). The consumer declares
   *  its invoker once and drops any manual restore, so the two never race. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

function focusedElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function normalizeFocusRestoreOpen(open: unknown): boolean {
  return open === true;
}

/**
 * Capture the currently focused element when `open` becomes true and restore it
 * when `open` becomes false or the host unmounts while still open. Surfaces keep
 * their own open/close semantics; this hook owns only the focus-return lifecycle.
 */
export function useFocusRestore(
  open: unknown,
  { onOpen, onClose, returnFocusRef }: FocusRestoreOptions = {},
): void {
  const previousFocus = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const returnTargetRef = useRef(returnFocusRef);

  useEffect(() => {
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    returnTargetRef.current = returnFocusRef;
  }, [onOpen, onClose, returnFocusRef]);

  useEffect(() => {
    const normalizedOpen = normalizeFocusRestoreOpen(open);
    const wasOpen = openRef.current;
    openRef.current = normalizedOpen;

    if (normalizedOpen && !wasOpen) {
      previousFocus.current = focusedElement();
      onOpenRef.current?.();
      return;
    }

    if (!normalizedOpen && wasOpen) {
      onCloseRef.current?.();
      // A DECLARED return target wins over the captured open-time element, so a
      // surface that opens via a non-invoker path restores to its real trigger
      // (never a stale `<body>`); else fall back to the captured element.
      (returnTargetRef.current?.current ?? previousFocus.current)?.focus?.();
      previousFocus.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      if (!openRef.current) return;
      (returnTargetRef.current?.current ?? previousFocus.current)?.focus?.();
      previousFocus.current = null;
    },
    [],
  );
}
