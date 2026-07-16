// The center workspace ghost / empty state (appshell-reframe #11). When the graph
// is toggled off AND no document is open, the center has nothing to render — this
// is the honest empty mode for that state, not a blank panel. It composes the
// centralized kit empty-state primitive (StateBlock) plus recovery affordances: bring
// the graph back, or create a document (authoring-surface ADR D5 — the
// highest-conversion create moment). Opening a document from the left rail is the
// third recovery path. The create button dispatches the ONE shared new-document action
// descriptor (`left-rail:new-document`), never a bespoke handler (unified action
// plane). Tokens + kit only (design-system-is-centralized / ui-labels-are-user-facing).

import { Button, StateBlock } from "../kit";
import { setShellGraphVisible } from "../../stores/view/shellLayout";
import { newDocumentAction } from "../../stores/view/leftRailKeybindings";
import { resolveActionPresentation } from "../../platform/actions/action";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";

export function WorkspaceGhost() {
  const resolveMessage = useLocalizedMessageResolver();
  const newDocument = newDocumentAction();
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-fg-3 bg-paper"
      data-workspace-ghost
    >
      <StateBlock
        mode="empty"
        title={resolveMessage({ key: "common:shell.workspace.emptyTitle" }).message}
        message={resolveMessage({ key: "common:shell.workspace.emptyMessage" }).message}
      />
      <div className="flex items-center gap-fg-2">
        <Button variant="primary" onClick={() => setShellGraphVisible(true)}>
          {resolveMessage({ key: "common:actions.showGraph" }).message}
        </Button>
        <Button variant="secondary" onClick={() => newDocument.run?.()}>
          {resolveActionPresentation(newDocument.label, resolveMessage).message}
        </Button>
      </div>
    </div>
  );
}
