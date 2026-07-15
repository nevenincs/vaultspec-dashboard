// Left-rail context menu: a vault document row in the browser (W03.P07). A pure
// resolver over the normalized descriptor — it reads only the descriptor's own
// fields (id, path, stem, nodeId), never global state, so it is unit-testable in
// isolation. The registration below contributes it for the "vault-doc" entity
// kind at module load.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionContext, ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";
import { copyLinkAction } from "../../../stores/view/documentLinkActions";
import { newDocumentAction } from "../../../stores/view/leftRailKeybindings";
import { relateToSelectionAction, showOnCanvasAction } from "../../menus/sharedActions";

/**
 * The menu for a vault document row. "Show on canvas" selects the document's
 * linked node (the shared selection focuses the field, exactly as the row click
 * does); copy the path and the stem; reveal and open-in-editor over the
 * document's path. Focus is navigation (non-mutating) — it shares the one
 * selection store the browser row click uses, so no `disabledInTimeTravel`.
 */
export function vaultDocMenu(entity: unknown, ctx?: ActionContext): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "vault-doc") return [];

  return [
    showOnCanvasAction({
      id: "vault-doc:focus",
      nodeId: normalizedEntity.nodeId ?? normalizedEntity.id,
      entity: normalizedEntity,
    }),
    revealAction({ id: "vault-doc:reveal", path: normalizedEntity.path }),
    openInEditorAction({
      id: "vault-doc:open-in-editor",
      path: normalizedEntity.path,
    }),
    copyAction({
      id: "vault-doc:copy-path",
      label: { key: "common:actions.copyPath" },
      text: normalizedEntity.path,
      what: "path",
    }),
    copyAction({
      id: "vault-doc:copy-stem",
      label: { key: "common:actions.copyDocumentName" },
      text: normalizedEntity.stem,
      what: "stem",
    }),
    // Copy a navigable wiki-link reference to this document. No app URL scheme
    // exists, so this copies the `[[stem]]` form the vault already uses for
    // cross-document links (authoring-surface ADR D3) — the SAME shared descriptor
    // the command palette enrolls under one id. Document-scoped here, so no anchor.
    copyLinkAction({ stem: normalizedEntity.stem }),
    // Add a related: edge from this document to the focused node (vault link add).
    relateToSelectionAction({
      id: "vault-doc:relate",
      srcStem: normalizedEntity.stem,
      scope: normalizedEntity.scope,
      ctx,
    }),
    // Create a new vault document (vaultspec-core vault add) — the rail is the home
    // for creation now that the stage create affordance is retired. Opens the
    // shared dialog; the row's feature is not carried on the entity, so no prefill.
    newDocumentAction(),
  ];
}

registerResolver("vault-doc", vaultDocMenu as ActionResolver);
