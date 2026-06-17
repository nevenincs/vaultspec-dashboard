// The project title (binding Figma `LeftRail` 244:750 header): the board's left
// rail opens with the PROJECT NAME as a plain title ("My Project") above the single
// worktree dropdown — NOT a second boxed picker, and with no "pick a project" /
// "add a project" affordances (those are not on the board). Figma is the binding
// source of truth (figma-is-the-binding-source-of-truth), so this surface renders
// exactly the board: the active workspace's name as a quiet title.
//
// Layer ownership (dashboard-layer-ownership): a dumb projection over the stores'
// `/workspaces` query — it reads the active workspace label and fetches nothing of
// its own. Workspace SWITCHING is not part of the binding rail; it stays available
// through the stores layer (`useSwapWorkspace`) for other surfaces, not re-created
// here as rail chrome the board does not show.

import {
  useActiveWorkspace,
  useWorkspaceRoots,
  useWorkspaces,
} from "../../stores/server/queries";

export function WorkspacePicker() {
  const workspaces = useWorkspaces();
  const roots = useWorkspaceRoots();
  const activeWorkspace = useActiveWorkspace();

  if (workspaces.isPending) {
    // Quiet copy-toned pending line — no spinner theatre, no control chrome.
    return (
      <p
        className="px-fg-1 text-label text-ink-faint"
        role="status"
        aria-live="polite"
        data-workspace-loading
      >
        loading…
      </p>
    );
  }

  const current = roots.find((r) => r.id === activeWorkspace) ?? roots[0];
  const label = current?.label ?? "Project";

  // The board title (163:149): the project name in Inter Medium body ink. Plain
  // title — no border, no chevron, no dropdown (the single worktree dropdown lives
  // in the WorktreePicker slot below).
  return (
    <div className="flex items-center px-fg-1" data-workspace-picker>
      <span
        className="min-w-0 flex-1 truncate text-body font-medium text-ink"
        title={current?.path}
        data-workspace-title
      >
        {label}
      </span>
    </div>
  );
}
