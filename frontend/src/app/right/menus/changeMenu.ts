// Right-rail context menu: a changed file or a diff hunk (W03.P08). A pure
// resolver over the ChangeEntity descriptor — it reads only the descriptor's own
// fields (path, hunk), never global state at resolve time. Open-in-editor and
// reveal are host-shell verbs that degrade honestly (disabled-with-reason in the
// browser); the copies are terminal copy verbs. This surface NEVER writes git
// (engine-read-and-infer) — there is no stage / discard / checkout action.
//
// App layer: resolvers live here; the registry is substrate. The registration
// below contributes this resolver for the "change" entity kind at module load.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { ChangeEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";

/**
 * The menu for a change. Open the file in the editor and reveal it in the file
 * manager (host-shell verbs, disabled-with-reason in the browser), copy its path,
 * and — only when the descriptor is a hunk rather than a whole file — copy the
 * hunk text.
 */
export function changeMenu(entity: ChangeEntity): ActionDescriptor[] {
  const actions: ActionDescriptor[] = [
    openInEditorAction({ id: "change:open-editor", path: entity.path }),
    revealAction({ id: "change:reveal", path: entity.path }),
    copyAction({
      id: "change:copy-path",
      label: "Copy path",
      text: entity.path,
      what: "path",
    }),
  ];

  // Copy the hunk text only when this descriptor IS a hunk (a whole-file change
  // carries no hunk, so the action is omitted rather than disabled).
  if (entity.hunk !== undefined) {
    actions.push(
      copyAction({
        id: "change:copy-hunk",
        label: "Copy hunk",
        text: entity.hunk,
      }),
    );
  }

  return actions;
}

registerResolver("change", changeMenu as ActionResolver<ChangeEntity>);
