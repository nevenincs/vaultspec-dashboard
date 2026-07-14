// Left-rail context menu: a corpus-bearing worktree row (W03.P07). A pure
// resolver over the WorktreeEntity descriptor — it reads only the descriptor's
// own fields (id, branch, path, hasVault), never global state, so it is
// unit-testable in isolation. The registration below contributes it for the
// "worktree" entity kind at module load.

import { legacyActionPresentation } from "../../../platform/actions/action";
import { GitBranch } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { revealAction } from "../../../platform/actions/shellActions";
import { worktreeActivateScopeDispatch } from "../../../stores/server/worktreeActions";

/**
 * The menu for a worktree row. "Switch to this scope" dispatches the same
 * stores-layer active-scope transition the row click uses, then docks the
 * playhead back to LIVE; copy the branch name, and reveal the worktree path in
 * the file manager. The switch is a MUTATION, so it carries
 * `disabledInTimeTravel`; a bare/non-corpus worktree is not a stage scope, so it
 * renders disabled-with-reason there.
 */
export function worktreeMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "worktree") return [];
  const actions: ActionDescriptor[] = [];

  const switchable = normalizedEntity.hasVault !== false;
  actions.push(
    switchable
      ? {
          id: "worktree:switch-scope",
          label: legacyActionPresentation("Switch to this scope"),
          section: "navigate",
          icon: GitBranch,
          disabledInTimeTravel: true,
          dispatch: worktreeActivateScopeDispatch(normalizedEntity.id),
        }
      : {
          id: "worktree:switch-scope",
          label: legacyActionPresentation("Switch to this scope"),
          section: "navigate",
          icon: GitBranch,
          disabled: true,
          disabledReason: legacyActionPresentation("no vault corpus to switch to"),
          disabledInTimeTravel: true,
        },
  );

  if (normalizedEntity.branch) {
    actions.push(
      copyAction({
        id: "worktree:copy-branch",
        label: { key: "common:actions.copy" },
        text: normalizedEntity.branch,
      }),
    );
  }

  actions.push(
    copyAction({
      id: "worktree:copy-id",
      label: { key: "common:actions.copy" },
      text: normalizedEntity.id,
      what: "id",
    }),
  );

  if (normalizedEntity.path) {
    actions.push(revealAction({ id: "worktree:reveal", path: normalizedEntity.path }));
  }

  return actions;
}

registerResolver("worktree", worktreeMenu as ActionResolver);
