// Right-rail context menu: a semantic search result row (W03.P08). A pure
// resolver over the normalized descriptor — it reads only the descriptor's own
// fields (source, nodeId, isCode), never global state at resolve time.
// Show-on-canvas is a non-mutating selection; open-in-editor and reveal are
// host-shell verbs that degrade honestly (disabled-with-reason in the browser);
// source-path copy is a terminal copy verb. Nothing here mutates the graph.
//
// App layer: resolvers live here; the registry is substrate. The registration
// below contributes this resolver for the "search-result" entity kind at module
// load.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { openEntityAction, showOnCanvasAction } from "../../menus/sharedActions";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";

/**
 * The menu for a search result. Show its graph node on the canvas (disabled when
 * the result carries no `nodeId` — a null-node result is not selectable), open it
 * in the editor (only for code results, whose `source` IS the path) and reveal it
 * in the file manager, then copy the source path.
 *
 * Open-in-editor and reveal degrade honestly in the browser (no host shell).
 */
export function searchResultMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "search-result") return [];

  const actions: ActionDescriptor[] = [];

  // Navigate: open the result on the stage — the ONE standardized open verb every
  // edge composes (command-palette-planes ADR). Disabled-with-reason when the
  // result carries no graph node to open.
  actions.push(
    openEntityAction({
      id: "search-result:open",
      nodeId: normalizedEntity.nodeId,
    }),
  );

  actions.push(
    showOnCanvasAction({
      id: "search-result:focus",
      nodeId: normalizedEntity.nodeId,
      entity: normalizedEntity,
    }),
  );

  // Navigate: open in editor — only meaningful for a code result, where the
  // result `source` IS the file path. Vault results carry a doc identifier, not a
  // shell path, so the action is offered only for code.
  if (normalizedEntity.isCode) {
    actions.push(
      openInEditorAction({
        id: "search-result:open-editor",
        path: normalizedEntity.source,
      }),
    );
  }

  // Navigate: reveal the source path in the file manager (host-shell, degrades).
  actions.push(
    revealAction({ id: "search-result:reveal", path: normalizedEntity.source }),
  );

  // Copy: the source path always.
  actions.push(
    copyAction({
      id: "search-result:copy-source",
      label: { key: "common:actions.copyPath" },
      text: normalizedEntity.source,
      what: "path",
    }),
  );

  return actions;
}

registerResolver("search-result", searchResultMenu as ActionResolver);
