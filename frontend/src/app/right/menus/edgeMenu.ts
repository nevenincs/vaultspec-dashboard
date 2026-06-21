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
import { selectEdge } from "../../../stores/view/selection";

/**
 * The menu for a provenance edge. Highlight it on the stage (a selection), and
 * copy its id (always), relation (when present), and destination (when present).
 * Relation and destination are optional on the descriptor, so their copy actions
 * are rendered disabled-with-reason when absent rather than omitted.
 */
export function edgeMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "edge") return [];
  const actions: ActionDescriptor[] = [];

  actions.push({
    id: "edge:highlight",
    label: "Highlight on stage",
    section: "navigate",
    icon: Highlighter,
    run: () => selectEdge(normalizedEntity.id),
  });

  // Navigate to the edge's destination node (the "related" node) when known.
  actions.push(
    normalizedEntity.dst
      ? {
          id: "edge:goto-destination",
          label: "Go to destination node",
          section: "navigate",
          icon: Crosshair,
          run: () => focusMenuNode(normalizedEntity.dst),
        }
      : {
          id: "edge:goto-destination",
          label: "Go to destination node",
          section: "navigate",
          icon: Crosshair,
          disabled: true,
          disabledReason: "no destination node",
        },
  );

  actions.push(
    copyAction({
      id: "edge:copy-id",
      label: "Copy id",
      text: normalizedEntity.id,
      what: "id",
    }),
  );

  if (normalizedEntity.relation) {
    actions.push(
      copyAction({
        id: "edge:copy-relation",
        label: "Copy relation",
        text: normalizedEntity.relation,
      }),
    );
  } else {
    actions.push({
      id: "edge:copy-relation",
      label: "Copy relation",
      section: "copy",
      disabled: true,
      disabledReason: "no relation",
    });
  }

  if (normalizedEntity.dst) {
    actions.push(
      copyAction({
        id: "edge:copy-destination",
        label: "Copy destination",
        text: normalizedEntity.dst,
      }),
    );
  } else {
    actions.push({
      id: "edge:copy-destination",
      label: "Copy destination",
      section: "copy",
      disabled: true,
      disabledReason: "no destination",
    });
  }

  // The whole edge as one JSON blob (id + relation + dst + tier) for pasting into
  // an issue / note.
  actions.push(
    copyAction({
      id: "edge:copy-full",
      label: "Copy edge (JSON)",
      text: JSON.stringify({
        id: normalizedEntity.id,
        relation: normalizedEntity.relation ?? null,
        dst: normalizedEntity.dst ?? null,
        tier: normalizedEntity.tier ?? null,
      }),
    }),
  );

  return actions;
}

registerResolver("edge", edgeMenu as ActionResolver);
