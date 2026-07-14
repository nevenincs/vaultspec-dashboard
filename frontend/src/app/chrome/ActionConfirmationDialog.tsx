import { useEffect } from "react";

import type { ActionConfirmationDescriptor } from "../../platform/localization/message";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ActionConfirmationDialogProps {
  open: boolean;
  confirmation: ActionConfirmationDescriptor;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ActionConfirmationDialog({
  open,
  confirmation,
  onConfirm,
  onCancel,
}: ActionConfirmationDialogProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const title = resolveMessage(confirmation.title);
  const body = resolveMessage(confirmation.body);
  const confirmLabel = resolveMessage(confirmation.confirmLabel);
  const cancelLabel = resolveMessage(confirmation.cancelLabel);
  const safe = ![title, body, confirmLabel, cancelLabel].some(
    (result) => result.usedFallback,
  );

  useEffect(() => {
    if (open && !safe) onCancel();
  }, [open, onCancel, safe]);

  if (!safe) return null;

  return (
    <ConfirmDialog
      open={open}
      title={title.message}
      message={body.message}
      confirmLabel={confirmLabel.message}
      cancelLabel={cancelLabel.message}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
