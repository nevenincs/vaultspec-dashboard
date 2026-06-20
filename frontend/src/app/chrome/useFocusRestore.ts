import { useEffect, useRef } from "react";

export interface FocusRestoreOptions {
  /** Runs immediately after focus is captured on the open edge. */
  onOpen?: () => void;
  /** Runs before focus is restored on the close edge. */
  onClose?: () => void;
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
  { onOpen, onClose }: FocusRestoreOptions = {},
): void {
  const previousFocus = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
  }, [onOpen, onClose]);

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
      previousFocus.current?.focus?.();
      previousFocus.current = null;
    }
  }, [open]);

  useEffect(
    () => () => {
      if (!openRef.current) return;
      previousFocus.current?.focus?.();
      previousFocus.current = null;
    },
    [],
  );
}
