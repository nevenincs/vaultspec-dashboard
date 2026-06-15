// Left-rail context menu: a registered project root (W03.P07). A pure resolver
// over the WorkspaceEntity descriptor — it reads only the descriptor's own
// fields (path, isLaunchDefault), never global state, so it is unit-testable in
// isolation. The host calls it through the registry; the registration below
// contributes it for the "workspace" entity kind at module load.
//
// App layer: resolvers live here (they may reach the stores), the registry is
// substrate. The one cross-cutting concern (the time-travel gate) is applied by
// the registry, not re-derived here — every mutating action just declares
// `disabledInTimeTravel`.

import { Star } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { WorkspaceEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { revealAction } from "../../../platform/actions/shellActions";

/**
 * The menu for a workspace row. Copy its path, reveal it in the file manager,
 * and offer "Set as launch default" as a transform.
 *
 * Set-as-launch-default is a MUTATION, so it carries `disabledInTimeTravel`. The
 * WorkspacePicker registers and switches roots through the stores' config
 * mutation seam (`useSwapWorkspace` / `usePutSession`), both of which are React
 * hooks that cannot be invoked from a pure resolver — there is no non-hook,
 * non-fetch store function that sets the launch default. Routing a mutation
 * through a bare closure here would also bypass the appDispatcher seam every
 * mutating verb must travel. So this stays honest: the action is rendered
 * disabled-with-reason until a terminal handler for the verb exists, rather than
 * shipping a no-op closure that silently does nothing.
 */
export function workspaceMenu(entity: WorkspaceEntity): ActionDescriptor[] {
  const actions: ActionDescriptor[] = [];

  // Transform (mutating, non-destructive): set this root as the launch default.
  // Disabled-with-reason — no safe store path exists from a pure resolver (see
  // the module note above). Still marked `disabledInTimeTravel` so the gate is
  // declared on the descriptor regardless of the current disabled state.
  actions.push({
    id: "workspace:set-launch-default",
    label: "Set as launch default",
    section: "transform",
    icon: Star,
    disabled: true,
    disabledReason: entity.isLaunchDefault
      ? "already the launch default"
      : "no-op pending host",
    disabledInTimeTravel: true,
  });

  if (entity.path) {
    actions.push(
      copyAction({
        id: "workspace:copy-path",
        label: "Copy path",
        text: entity.path,
        what: "path",
      }),
    );
    actions.push(revealAction({ id: "workspace:reveal", path: entity.path }));
  }

  return actions;
}

registerResolver("workspace", workspaceMenu as ActionResolver<WorkspaceEntity>);
