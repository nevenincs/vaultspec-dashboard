// Left-rail context menu: a code file or directory row in the tree (W03.P07). A
// pure resolver over the CodeFileEntity descriptor — it reads only the
// descriptor's own fields (id, path, isDir, nodeId), never global state, so it
// is unit-testable in isolation. The registration below contributes it for the
// "code-file" entity kind at module load.

import { Crosshair } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";
import { focusMenuNode } from "../../../stores/view/menuActions";

/**
 * The menu for a code-tree row. A FILE offers "Focus linked node" (select its
 * `code:` node — navigation, shared with the row click; disabled-with-reason
 * when the file has no graph linkage yet), copy path, reveal, and
 * open-in-editor. A DIRECTORY is not a graph node and is not opened in an editor,
 * so it omits focus and open-in-editor — it offers only copy path and reveal.
 */
export function codeFileMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "code-file") return [];
  const actions: ActionDescriptor[] = [];

  if (!normalizedEntity.isDir) {
    const linked =
      normalizedEntity.nodeId !== undefined && normalizedEntity.nodeId.length > 0;
    actions.push(
      linked
        ? {
            id: "code-file:focus",
            label: "Focus linked node",
            section: "navigate",
            icon: Crosshair,
            run: () => focusMenuNode(normalizedEntity.nodeId, normalizedEntity),
          }
        : {
            id: "code-file:focus",
            label: "Focus linked node",
            section: "navigate",
            icon: Crosshair,
            disabled: true,
            disabledReason: "no graph node for this file yet",
          },
    );
  }

  actions.push(revealAction({ id: "code-file:reveal", path: normalizedEntity.path }));

  if (!normalizedEntity.isDir) {
    actions.push(
      openInEditorAction({
        id: "code-file:open-in-editor",
        path: normalizedEntity.path,
      }),
    );
  }

  actions.push(
    copyAction({
      id: "code-file:copy-path",
      label: "Copy path",
      text: normalizedEntity.path,
      what: "path",
    }),
  );

  return actions;
}

registerResolver("code-file", codeFileMenu as ActionResolver);
