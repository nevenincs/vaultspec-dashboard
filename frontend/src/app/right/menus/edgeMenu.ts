// Right-rail context menu: a provenance edge (W03.P08). A pure resolver over the
// EdgeEntity descriptor — it reads only the descriptor's own fields (relation,
// dst), never global state at resolve time. Highlight-on-stage is a non-mutating
// selection; the copies are terminal copy verbs. Nothing here mutates, so no
// action carries `disabledInTimeTravel`.
//
// App layer: resolvers live here; the registry is substrate. The registration
// below contributes this resolver for the "edge" entity kind at module load.

import { Highlighter } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { EdgeEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { selectEdge } from "../../../stores/view/selection";

/**
 * The menu for a provenance edge. Highlight it on the stage (a selection), and
 * copy its id (always), relation (when present), and destination (when present).
 * Relation and destination are optional on the descriptor, so their copy actions
 * are rendered disabled-with-reason when absent rather than omitted.
 */
export function edgeMenu(entity: EdgeEntity): ActionDescriptor[] {
  const actions: ActionDescriptor[] = [];

  actions.push({
    id: "edge:highlight",
    label: "Highlight on stage",
    section: "navigate",
    icon: Highlighter,
    run: () => selectEdge(entity.id),
  });

  actions.push(
    copyAction({
      id: "edge:copy-id",
      label: "Copy id",
      text: entity.id,
      what: "id",
    }),
  );

  if (entity.relation) {
    actions.push(
      copyAction({
        id: "edge:copy-relation",
        label: "Copy relation",
        text: entity.relation,
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

  if (entity.dst) {
    actions.push(
      copyAction({
        id: "edge:copy-destination",
        label: "Copy destination",
        text: entity.dst,
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

  return actions;
}

registerResolver("edge", edgeMenu as ActionResolver<EdgeEntity>);
