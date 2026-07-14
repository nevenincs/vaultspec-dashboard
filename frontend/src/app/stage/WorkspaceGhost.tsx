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

export function WorkspaceGhost() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-fg-3 bg-paper"
      data-workspace-ghost
    >
      <StateBlock
        mode="empty"
        title="Nothing open"
        message="Show the graph, create a document, or open one from the rail."
      />
      <div className="flex items-center gap-fg-2">
        <Button variant="primary" onClick={() => setShellGraphVisible(true)}>
          Show graph
        </Button>
        <Button variant="secondary" onClick={() => newDocumentAction().run?.()}>
          Add to a feature
        </Button>
      </div>
    </div>
  );
}
