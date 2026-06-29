// The center workspace ghost / empty state (appshell-reframe #11). When the graph
// is toggled off AND no document is open, the center has nothing to render — this
// is the honest empty mode for that state, not a blank panel. It composes the
// centralized kit empty-state primitive (StateBlock) plus one primary affordance to
// bring the graph back; opening a document from the left rail is the other recovery
// path. Tokens + kit only (design-system-is-centralized / ui-labels-are-user-facing).

import { Button, StateBlock } from "../kit";
import { setShellGraphVisible } from "../../stores/view/shellLayout";

export function WorkspaceGhost() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-fg-3 bg-paper"
      data-workspace-ghost
    >
      <StateBlock
        mode="empty"
        title="Nothing open"
        message="Show the graph, or open a document from the rail."
      />
      <Button variant="primary" onClick={() => setShellGraphVisible(true)}>
        Show graph
      </Button>
    </div>
  );
}
