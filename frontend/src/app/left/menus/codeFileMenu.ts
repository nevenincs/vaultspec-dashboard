// Left-rail context menu: a code file or directory row in the tree (W03.P07). A
// pure resolver over the CodeFileEntity descriptor — it reads only the
// descriptor's own fields (id, path, isDir, nodeId), never global state, so it
// is unit-testable in isolation. The registration below contributes it for the
// "code-file" entity kind at module load.

import { Crosshair } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { CodeFileEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";
import { selectNode } from "../../../stores/view/selection";

/**
 * The menu for a code-tree row. A FILE offers "Focus linked node" (select its
 * `code:` node — navigation, shared with the row click; disabled-with-reason
 * when the file has no graph linkage yet), copy path, reveal, and
 * open-in-editor. A DIRECTORY is not a graph node and is not opened in an editor,
 * so it omits focus and open-in-editor — it offers only copy path and reveal.
 */
export function codeFileMenu(entity: CodeFileEntity): ActionDescriptor[] {
  const actions: ActionDescriptor[] = [];

  if (!entity.isDir) {
    const linked = entity.nodeId !== undefined && entity.nodeId.length > 0;
    actions.push({
      id: "code-file:focus",
      label: "Focus linked node",
      section: "navigate",
      icon: Crosshair,
      disabled: !linked,
      disabledReason: linked ? undefined : "no graph node for this file yet",
      run: linked ? () => selectNode(entity.nodeId!) : undefined,
    });
  }

  actions.push(revealAction({ id: "code-file:reveal", path: entity.path }));

  if (!entity.isDir) {
    actions.push(
      openInEditorAction({ id: "code-file:open-in-editor", path: entity.path }),
    );
  }

  actions.push(
    copyAction({
      id: "code-file:copy-path",
      label: "Copy path",
      text: entity.path,
      what: "path",
    }),
  );

  return actions;
}

registerResolver("code-file", codeFileMenu as ActionResolver<CodeFileEntity>);
