// Right-rail context menu: a semantic search result row (W03.P08). A pure
// resolver over the normalized descriptor — it reads only the descriptor's own
// fields (source, nodeId, score, isCode), never global state at resolve time.
// Focus-node is a non-mutating selection; open-in-editor and reveal are
// host-shell verbs that degrade honestly (disabled-with-reason in the browser);
// the copies are terminal copy verbs. Nothing here mutates the graph.
//
// App layer: resolvers live here; the registry is substrate. The registration
// below contributes this resolver for the "search-result" entity kind at module
// load.

import { legacyActionPresentation } from "../../../platform/actions/action";
import { Crosshair } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { openEntityAction } from "../../menus/sharedActions";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";
import { focusMenuNode } from "../../../stores/view/menuActions";

/**
 * The menu for a search result. Focus its graph node (disabled-with-reason when
 * the result carries no `nodeId` — a null-node result is not selectable), open it
 * in the editor (only for code results, whose `source` IS the path) and reveal it
 * in the file manager, then copy the source path and the relevance score.
 *
 * Open-in-editor and reveal degrade honestly in the browser (no host shell), and
 * the score copy is disabled-with-reason when the result carries no score.
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
      disabledReason: legacyActionPresentation("no graph node"),
    }),
  );

  // Navigate: focus the result's graph node. Disabled-with-reason when there is
  // no node to focus (a null-node_id result, the unselectable row).
  if (normalizedEntity.nodeId) {
    const nodeId = normalizedEntity.nodeId;
    actions.push({
      id: "search-result:focus",
      label: legacyActionPresentation("Focus node"),
      section: "navigate",
      icon: Crosshair,
      run: () => focusMenuNode(nodeId, normalizedEntity),
    });
  } else {
    actions.push({
      id: "search-result:focus",
      label: legacyActionPresentation("Focus node"),
      section: "navigate",
      icon: Crosshair,
      disabled: true,
      disabledReason: legacyActionPresentation("no graph node"),
    });
  }

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

  // Copy: the relevance score when present; disabled-with-reason otherwise.
  if (normalizedEntity.score !== undefined) {
    actions.push(
      copyAction({
        id: "search-result:copy-score",
        label: { key: "common:actions.copy" },
        text: String(normalizedEntity.score),
      }),
    );
  } else {
    actions.push({
      id: "search-result:copy-score",
      label: { key: "common:actions.copy" },
      section: "copy",
      disabled: true,
      disabledReason: legacyActionPresentation("no score"),
    });
  }

  // The whole result as one JSON blob (source + nodeId + score + isCode).
  actions.push(
    copyAction({
      id: "search-result:copy-full",
      label: { key: "common:actions.copy" },
      text: JSON.stringify({
        source: normalizedEntity.source,
        nodeId: normalizedEntity.nodeId ?? null,
        score: normalizedEntity.score ?? null,
        isCode: normalizedEntity.isCode ?? false,
      }),
    }),
  );

  return actions;
}

registerResolver("search-result", searchResultMenu as ActionResolver);
