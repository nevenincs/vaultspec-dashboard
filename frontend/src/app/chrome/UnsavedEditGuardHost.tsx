import { useUnsavedEditGuardStore } from "../../stores/view/unsavedEditGuard";
import { ActionConfirmationDialog } from "./ActionConfirmationDialog";

export function UnsavedEditGuardHost() {
  // Select raw, referentially-stable slices (stable-selectors): the pending entry and
  // the two stable store actions. No derived value is minted inside the selector.
  const pending = useUnsavedEditGuardStore((state) => state.pending);
  const confirm = useUnsavedEditGuardStore((state) => state.confirm);
  const cancel = useUnsavedEditGuardStore((state) => state.cancel);

  if (pending === null) return null;

  return (
    <ActionConfirmationDialog
      open
      confirmation={pending.confirmation}
      onConfirm={confirm}
      onCancel={cancel}
    />
  );
}
