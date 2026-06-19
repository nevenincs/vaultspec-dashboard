// The left scope rail composition (dashboard-left-rail ADR "The rail as an
// ordered stack of hosted slots"): the rail is CHROME that hosts independently-
// specified controls and owns only their composition. Top to bottom, each
// separated by a soft 1px rule, this stack hosts:
//
//   1. WorkspacePicker  — the coarsest scope chooser (which PROJECT); a quiet
//                          header when only one root is registered.
//   2. WorktreePicker   — the repository → branch → worktree picker (which
//                          WORKTREE), scoped to the active workspace.
//   3. BrowserRegion    — the file-thinking surface: vault | code modes behind a
//                          toggle, with an in-rail filter (which DOCUMENT/FILE).
//
// "The ordering is the contract made physical": scope is chosen coarse-to-fine —
// workspace, then worktree, then document/file — mirroring the stateless-scope
// rule. The header's collapse toggle (owned by the AppShell `aside` chrome) is
// FIRST in the rail's single top-to-bottom focus order; this content stack
// continues that order (workspace → worktree → browser mode toggle → filter →
// the active mode's rows), and the whole rail content is ONE labelled navigation
// landmark.
//
// THE SINGLE NAVIGATION LAW (dashboard-left-rail ADR / engine-read-and-infer):
// every interaction in this stack resolves to one of exactly three intents,
// emitted through the stores layer — (a) select a scope (workspace/worktree →
// the wholesale reset), (b) select a node (vault doc / code file → focus the
// stage by stable id), or (c) adjust a view-local affordance (collapse, mode
// toggle, filter, group expand). The rail issues NO mutation intent of any kind:
// there is no write path from the rail to git, disk, or the vault, and no
// component here fetches the engine, mints a node identity, or reads the raw
// `tiers` block. Git is surfaced as read-only status through stores-owned
// projections; working git review is the right rail's concern. This module
// composes; the hosted controls own their own behaviour.

import { BrowserRegion } from "./BrowserRegion";
import { WorktreePicker } from "./WorktreePicker";

export function LeftRail() {
  return (
    // ONE labelled navigation landmark for the whole rail content (ADR "Keyboard
    // and a11y", "the rail is one labelled navigation landmark"). Attenuated
    // chrome: the rail cedes attention to the stage; the active surface is
    // brightest. The flex column gives the browser region the remaining height so
    // it dominates the rail (the workspace/worktree pickers are compact).
    <nav
      aria-label="scope rail"
      data-left-rail
      // Binding rail spacing (board 244:750): px 12, pt 14, and a uniform 14px gap
      // between the stacked slots — NO separators (the board has none).
      className="flex min-h-0 flex-1 flex-col gap-[0.875rem] px-fg-3 pt-[0.875rem] text-ink-muted"
    >
      {/* The single rail title: one clickable element showing the current
          worktree's NAME (default = "main"); clicking opens the worktree/folder
          picker. Repository status (the branch) is stated once, in the right
          rail — the left rail no longer repeats a project title or the branch. */}
      <div className="shrink-0" data-rail-slot="worktree">
        <WorktreePicker />
      </div>

      {/* 3. Browser region: Vault/Code toggle, the filter, and the document
             list. Fills the remaining height so the browser dominates the rail. */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-[0.875rem]"
        data-rail-slot="browser"
      >
        <BrowserRegion />
      </div>
    </nav>
  );
}
