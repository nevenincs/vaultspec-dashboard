// Right-rail context menu: a semantic search result row (W03.P08). A pure
// resolver over the SearchResultEntity descriptor — it reads only the
// descriptor's own fields (source, nodeId, score, isCode), never global state at
// resolve time. Focus-node is a non-mutating selection; open-in-editor and reveal
// are host-shell verbs that degrade honestly (disabled-with-reason in the
// browser); the copies are terminal copy verbs. Nothing here mutates the graph.
//
// App layer: resolvers live here; the registry is substrate. The registration
// below contributes this resolver for the "search-result" entity kind at module
// load.

import { Crosshair } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { SearchResultEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";
import { selectNode } from "../../../stores/view/selection";

/**
 * The menu for a search result. Focus its graph node (disabled-with-reason when
 * the result carries no `nodeId` — a null-node result is not selectable), open it
 * in the editor (only for code results, whose `source` IS the path) and reveal it
 * in the file manager, then copy the source path and the relevance score.
 *
 * Open-in-editor and reveal degrade honestly in the browser (no host shell), and
 * the score copy is disabled-with-reason when the result carries no score.
 */
export function searchResultMenu(entity: SearchResultEntity): ActionDescriptor[] {
  const actions: ActionDescriptor[] = [];

  // Navigate: focus the result's graph node. Disabled-with-reason when there is
  // no node to focus (a null-node_id result, the unselectable row).
  if (entity.nodeId) {
    const nodeId = entity.nodeId;
    actions.push({
      id: "search-result:focus",
      label: "Focus node",
      section: "navigate",
      icon: Crosshair,
      run: () => selectNode(nodeId),
    });
  } else {
    actions.push({
      id: "search-result:focus",
      label: "Focus node",
      section: "navigate",
      icon: Crosshair,
      disabled: true,
      disabledReason: "no graph node",
    });
  }

  // Navigate: open in editor — only meaningful for a code result, where the
  // result `source` IS the file path. Vault results carry a doc identifier, not a
  // shell path, so the action is offered only for code.
  if (entity.isCode) {
    actions.push(
      openInEditorAction({ id: "search-result:open-editor", path: entity.source }),
    );
  }

  // Navigate: reveal the source path in the file manager (host-shell, degrades).
  actions.push(revealAction({ id: "search-result:reveal", path: entity.source }));

  // Copy: the source path always.
  actions.push(
    copyAction({
      id: "search-result:copy-source",
      label: "Copy source path",
      text: entity.source,
      what: "path",
    }),
  );

  // Copy: the relevance score when present; disabled-with-reason otherwise.
  if (entity.score !== undefined) {
    actions.push(
      copyAction({
        id: "search-result:copy-score",
        label: "Copy score",
        text: String(entity.score),
      }),
    );
  } else {
    actions.push({
      id: "search-result:copy-score",
      label: "Copy score",
      section: "copy",
      disabled: true,
      disabledReason: "no score",
    });
  }

  return actions;
}

registerResolver(
  "search-result",
  searchResultMenu as ActionResolver<SearchResultEntity>,
);
