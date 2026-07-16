// Left-rail context menu: a registered project root (W03.P07). A pure resolver
// over the normalized descriptor — it reads only the descriptor's own fields
// (path, isLaunchDefault), never global state, so it is unit-testable in
// isolation. The host calls it through the registry; the registration below
// contributes it for the "workspace" entity kind at module load.
//
// App layer: resolvers live here (they may reach the stores), the registry is
// substrate. The one cross-cutting concern (the time-travel gate) is applied by
// the registry, not re-derived here — every mutating action just declares
// `disabledInTimeTravel`.

import { Trash2 } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { revealAction } from "../../../platform/actions/shellActions";
import { SESSION_ACTION } from "../../../stores/server/sessionActions";

/**
 * The menu for a workspace row: copy its path, reveal it in the file manager, and
 * "Remove from registry" (`workspace:forget`).
 *
 * Remove-from-registry is a DESTRUCTIVE mutation (`PUT /session forget_workspace`),
 * so it is confirm-guarded and carries `disabledInTimeTravel`, and it dispatches
 * through the one session seam (`SESSION_ACTION` → appDispatcher → engine), never a
 * bare closure. The launch root is the registry's anchor and is never forgettable,
 * so it renders disabled-with-reason there. (The prior "set as launch default"
 * action was removed — `is_launch` is the auto-determined launch root, not a
 * user-settable preference, so a permanently-disabled action would have implied a
 * capability that does not exist; unified-action-plane removes such non-capabilities
 * rather than shipping the disabled lie.)
 */
export function workspaceMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "workspace") return [];

  const actions: ActionDescriptor[] = [];

  if (normalizedEntity.path) {
    actions.push(
      copyAction({
        id: "workspace:copy-path",
        label: { key: "common:actions.copyPath" },
        text: normalizedEntity.path,
        what: "path",
      }),
    );
    actions.push(revealAction({ id: "workspace:reveal", path: normalizedEntity.path }));
  }

  // Remove this project from the workspace registry (PUT /session forget_workspace),
  // routed through the session dispatch seam. Destructive → confirm + time-travel
  // gate. The launch root is the registry's anchor and is never forgettable, so it
  // renders disabled-with-reason there.
  const forgetBase = {
    id: "workspace:forget",
    label: { key: "common:actions.removeFromRegistry" } as const,
    section: "danger" as const,
    icon: Trash2,
    confirm: true,
    disabledInTimeTravel: true,
  };
  if (!normalizedEntity.path) {
    actions.push({
      ...forgetBase,
      disabled: true,
      disabledReason: { key: "common:disabledReasons.noProjectPath" },
    });
  } else if (normalizedEntity.isLaunchDefault) {
    actions.push({
      ...forgetBase,
      disabled: true,
      disabledReason: {
        key: "common:disabledReasons.launchProjectCannotBeRemoved",
      },
    });
  } else {
    actions.push({
      ...forgetBase,
      dispatch: {
        type: SESSION_ACTION,
        payload: { forget_workspace: normalizedEntity.path },
      },
    });
  }

  return actions;
}

registerResolver("workspace", workspaceMenu as ActionResolver);
