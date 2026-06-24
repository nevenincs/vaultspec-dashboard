// App-chrome host for the unsaved-edit arm-to-confirm (data-safety). Mounted once at
// the shell; renders the shared ConfirmDialog when a dirty-draft discard is staged
// through `guardUnsavedDiscard` (a scope switch or an editor close while the markdown
// editor holds unsaved changes). Dumb chrome: it reads the guard store and dispatches
// confirm/cancel, nothing more (dashboard-layer-ownership).

import { useUnsavedEditGuardStore } from "../../stores/view/unsavedEditGuard";
import { ConfirmDialog } from "./ConfirmDialog";

export function UnsavedEditGuardHost() {
  // Select raw, referentially-stable slices (stable-selectors): the pending entry and
  // the two stable store actions. No derived value is minted inside the selector.
  const pending = useUnsavedEditGuardStore((state) => state.pending);
  const confirm = useUnsavedEditGuardStore((state) => state.confirm);
  const cancel = useUnsavedEditGuardStore((state) => state.cancel);

  return (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.title ?? ""}
      message={pending?.message ?? ""}
      confirmLabel={pending?.confirmLabel ?? "Discard changes"}
      cancelLabel="Keep editing"
      onConfirm={confirm}
      onCancel={cancel}
    />
  );
}
