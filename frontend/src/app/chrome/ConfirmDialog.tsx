// Confirmation content composed within the shared modal shell. The confirm
// action receives focus so the flow can be completed from the keyboard.

import { useEffect, useRef } from "react";

import { useLocalizedMessage } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { Button } from "../kit";
import { Dialog } from "./Dialog";

export const CONFIRM_DIALOG_MESSAGES = {
  cancel: { key: "common:actions.cancel" },
} as const satisfies Record<string, MessageDescriptor>;

export interface ConfirmDialogProps {
  /** Whether the dialog is mounted/visible. */
  open: boolean;
  /** The dialog title (e.g. "Archive feature"). */
  title: string;
  /** The body copy explaining the consequence of confirming. */
  message: React.ReactNode;
  /** The accent confirm button label (e.g. "Archive"). */
  confirmLabel: string;
  /** Optional caller-owned cancel button label. */
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
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const defaultCancelLabel = useLocalizedMessage(CONFIRM_DIALOG_MESSAGES.cancel);
  const resolvedCancelLabel = cancelLabel ?? defaultCancelLabel;
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
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-fg-2">
          <Button variant="secondary" onClick={onCancel}>
            {resolvedCancelLabel}
          </Button>
          <Button ref={confirmRef} variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {/* The consequence is visually subordinate to the action. */}
      <p className="px-fg-4 py-fg-4 text-body text-ink-muted">{message}</p>
    </Dialog>
  );
}
