// Left-rail context menu: a vault document row in the browser (W03.P07). A pure
// resolver over the VaultDocEntity descriptor — it reads only the descriptor's
// own fields (id, path, stem, nodeId), never global state, so it is
// unit-testable in isolation. The registration below contributes it for the
// "vault-doc" entity kind at module load.

import { Crosshair } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { VaultDocEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  openInEditorAction,
  revealAction,
} from "../../../platform/actions/shellActions";
import { selectNode } from "../../../stores/view/selection";

/**
 * The menu for a vault document row. "Focus on stage" selects the document's
 * linked node (the shared selection focuses the field, exactly as the row click
 * does); copy the path and the stem; reveal and open-in-editor over the
 * document's path. Focus is navigation (non-mutating) — it shares the one
 * selection store the browser row click uses, so no `disabledInTimeTravel`.
 */
export function vaultDocMenu(entity: VaultDocEntity): ActionDescriptor[] {
  return [
    {
      id: "vault-doc:focus",
      label: "Focus on stage",
      section: "navigate",
      icon: Crosshair,
      run: () => selectNode(entity.nodeId ?? entity.id),
    },
    revealAction({ id: "vault-doc:reveal", path: entity.path }),
    openInEditorAction({ id: "vault-doc:open-in-editor", path: entity.path }),
    copyAction({
      id: "vault-doc:copy-path",
      label: "Copy path",
      text: entity.path,
      what: "path",
    }),
    copyAction({
      id: "vault-doc:copy-stem",
      label: "Copy stem",
      text: entity.stem,
      what: "stem",
    }),
  ];
}

registerResolver("vault-doc", vaultDocMenu as ActionResolver<VaultDocEntity>);
