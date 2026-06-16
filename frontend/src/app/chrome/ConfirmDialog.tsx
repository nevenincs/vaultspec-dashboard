// The confirm-dialog content layer (figma 17:1276 "Archive feature"): the
// arm-to-confirm modal that composes the shared `Dialog` shell with a body copy
// block and a Cancel / accent-confirm button row. The shell owns the scrim,
// focus trap, Escape / backdrop dismiss and focus restore; this layer owns the
// confirm semantics — the body message, the destructive verb, and the two-button
// footer with the accent confirm affordance auto-focused so the flow completes
// from the keyboard (arm-to-confirm: the dialog IS the second step).
//
// Layer ownership (dashboard-layer-ownership): app-chrome. It renders props and
// fires the supplied callbacks; it never fetches the engine nor reads the raw
// tiers block. All color derives from the OKLCH semantic tokens (no hex, no
// `dark:` variant); the only glyph is the Lucide close in the shell.

import { useEffect, useRef } from "react";

import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  /** Whether the dialog is mounted/visible. */
  open: boolean;
  /** The dialog title (e.g. "Archive feature"). */
  title: string;
  /** The body copy explaining the consequence of confirming. */
  message: React.ReactNode;
  /** The accent confirm button label (e.g. "Archive"). */
  confirmLabel: string;
  /** The cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Called when the user confirms (the accent button or the focused Enter). */
  onConfirm: () => void;
  /** Called on every dismiss path: Cancel, Escape, backdrop, the close button. */
  onCancel: () => void;
}

/**
 * A confirm dialog. The accent confirm button auto-focuses on open so the
 * two-step flow is keyboard-completable; Cancel / Escape / backdrop all dismiss
 * through `onCancel`.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Auto-focus the confirm affordance once the shell has mounted it, so the
  // armed step is reachable by Enter alone (the shell focuses the first
  // focusable, which is Cancel; we override to the destructive verb's confirm).
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => confirmRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="flex flex-col">
        {/* Body copy: the consequence, in muted ink (figma 17:1284). */}
        <p className="px-fg-4 py-fg-4 text-body text-ink-muted">{message}</p>

        {/* Footer: a top-ruled button row, right-aligned (figma 17:1285). */}
        <div className="flex shrink-0 items-center justify-end gap-fg-2 border-t border-rule px-fg-4 py-fg-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-fg-xs border border-rule px-fg-3 py-fg-1-5 text-body font-medium text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-fg-xs bg-accent-subtle px-fg-3 py-fg-1-5 text-body font-medium text-accent-text transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
