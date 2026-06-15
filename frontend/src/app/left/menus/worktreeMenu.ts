// Left-rail context menu: a corpus-bearing worktree row (W03.P07). A pure
// resolver over the WorktreeEntity descriptor — it reads only the descriptor's
// own fields (id, branch, path, hasVault), never global state, so it is
// unit-testable in isolation. The registration below contributes it for the
// "worktree" entity kind at module load.

import { GitBranch } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { WorktreeEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { revealAction } from "../../../platform/actions/shellActions";
import { useViewStore } from "../../../stores/view/viewStore";
import { movePlayhead } from "../../timeline/Playhead";

/**
 * The menu for a worktree row. "Switch to this scope" fires the same imperative
 * scope swap the row click uses (the stores' `setScope`, which owns the single
 * 022 cross-store reset, plus docking the playhead back to LIVE); copy the
 * branch name, and reveal the worktree path in the file manager.
 *
 * The row click also issues a durable `PUT /session active_scope` write through
 * `usePutSession` (a React hook) so the selection survives a reload. That hook
 * cannot be invoked from a pure resolver, so the menu's switch mirrors only the
 * synchronous optimistic half of the row click; the durable write is the click
 * path's responsibility, not the menu's. The switch is a MUTATION, so it carries
 * `disabledInTimeTravel`; a bare/non-corpus worktree is not a stage scope, so it
 * renders disabled-with-reason there.
 */
export function worktreeMenu(entity: WorktreeEntity): ActionDescriptor[] {
  const actions: ActionDescriptor[] = [];

  const switchable = entity.hasVault !== false;
  actions.push({
    id: "worktree:switch-scope",
    label: "Switch to this scope",
    section: "navigate",
    icon: GitBranch,
    disabled: !switchable,
    disabledReason: switchable ? undefined : "no vault corpus to switch to",
    disabledInTimeTravel: true,
    run: switchable
      ? () => {
          // The same synchronous swap the row click runs: the stores' setScope
          // performs the single cross-store reset, then the playhead docks back
          // to LIVE (the store also resets the mode to live).
          useViewStore.getState().setScope(entity.id);
          movePlayhead("live");
        }
      : undefined,
  });

  if (entity.branch) {
    actions.push(
      copyAction({
        id: "worktree:copy-branch",
        label: "Copy branch",
        text: entity.branch,
      }),
    );
  }

  if (entity.path) {
    actions.push(revealAction({ id: "worktree:reveal", path: entity.path }));
  }

  return actions;
}

registerResolver("worktree", worktreeMenu as ActionResolver<WorktreeEntity>);
