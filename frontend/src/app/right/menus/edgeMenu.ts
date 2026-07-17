// Right-rail context menu: a provenance edge (W03.P08). A pure resolver over the
// EdgeEntity descriptor — it reads only the descriptor's own fields (relation,
// dst), never global state at resolve time. Highlight-on-stage is a non-mutating
// selection; the copies are terminal copy verbs. Nothing here mutates, so no
// action carries `disabledInTimeTravel`.
//
// App layer: resolvers live here; the registry is substrate. The registration
// below contributes this resolver for the "edge" entity kind at module load.

import { Crosshair, Highlighter } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { focusMenuNode } from "../../../stores/view/menuActions";
import { docStemFromNodeId } from "../../menus/sharedActions";
import { selectEdge } from "../../../stores/view/selection";

/**
 * The menu for a provenance edge. Highlight it on the stage (a selection), copy
 * its relation label, and copy the destination's document name. The clipboard is
 * user-facing output, so the edge's raw internal id and a raw JSON dump are never
 * copied (context-menu-copy-safety CMCS-001); the destination reference is the
 * document name of a document endpoint, disabled-with-reason when the destination
 * is absent or not a document.
 */
export function edgeMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "edge") return [];
  const actions: ActionDescriptor[] = [];

  actions.push({
    id: "edge:highlight",
    label: { key: "common:actions.highlightOnStage" },
    section: "navigate",
    icon: Highlighter,
    run: () => selectEdge(normalizedEntity.id),
  });

  // Navigate to the edge's destination node (the "related" node) when known.
  actions.push(
    normalizedEntity.dst
      ? {
          id: "edge:goto-destination",
          label: { key: "common:actions.goToDestinationNode" },
          section: "navigate",
          icon: Crosshair,
          run: () => focusMenuNode(normalizedEntity.dst),
        }
      : {
          id: "edge:goto-destination",
          label: { key: "common:actions.goToDestinationNode" },
          section: "navigate",
          icon: Crosshair,
          disabled: true,
          disabledReason: { key: "common:disabledReasons.noDestinationNode" },
        },
  );

  if (normalizedEntity.relation) {
    actions.push(
      copyAction({
        id: "edge:copy-relation",
        label: { key: "common:actions.copy" },
        text: normalizedEntity.relation,
      }),
    );
  } else {
    actions.push({
      id: "edge:copy-relation",
      label: { key: "common:actions.copy" },
      section: "copy",
      disabled: true,
      disabledReason: { key: "common:disabledReasons.noRelation" },
    });
  }

  // The destination's public reference is its document name (an endpoint document
  // node's stem), never the raw destination node id. Omitted-with-reason when the
  // destination is absent or is not a document.
  const destinationName = docStemFromNodeId(normalizedEntity.dst);
  if (destinationName !== null) {
    actions.push(
      copyAction({
        id: "edge:copy-destination",
        label: { key: "common:actions.copyDocumentName" },
        text: destinationName,
        what: "stem",
      }),
    );
  } else {
    actions.push({
      id: "edge:copy-destination",
      label: { key: "common:actions.copyDocumentName" },
      section: "copy",
      disabled: true,
      disabledReason: { key: "common:disabledReasons.noDestination" },
    });
  }

  return actions;
}

registerResolver("edge", edgeMenu as ActionResolver);
