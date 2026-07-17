// Meta-edge context menu (dashboard-context-menus W04.P11): an aggregated
// feature-to-feature ribbon. The breakdown already unfolds on hover, so the menu
// is modest and honest - copy the breakdown summary (when present) and the id.
// Pure over the descriptor; nothing mutates.

import { Crosshair } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import type { MessageDescriptor } from "../../../platform/localization/message";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { focusMenuNode } from "../../../stores/view/menuActions";

/** A "go to endpoint" navigate action over a meta-edge endpoint feature node, or
 *  a disabled-with-reason placeholder when the endpoint id is absent. */
function gotoEndpointAction(
  id: string,
  label: MessageDescriptor,
  unavailableReason: MessageDescriptor,
  nodeId: string | undefined,
): ActionDescriptor {
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    return {
      id,
      label,
      section: "navigate",
      disabled: true,
      disabledReason: unavailableReason,
    };
  }
  return {
    id,
    label,
    section: "navigate",
    icon: Crosshair,
    run: () => focusMenuNode(nodeId),
  };
}

export function metaEdgeMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "meta-edge") return [];

  return [
    gotoEndpointAction(
      "meta-edge:goto-src",
      { key: "graph:actions.showStartingItem" },
      { key: "graph:disabledReasons.startingItemUnavailable" },
      normalizedEntity.src,
    ),
    gotoEndpointAction(
      "meta-edge:goto-dst",
      { key: "graph:actions.showRelatedItem" },
      { key: "graph:disabledReasons.relatedItemUnavailable" },
      normalizedEntity.dst,
    ),
    normalizedEntity.summary
      ? copyAction({
          id: "meta-edge:copy-summary",
          label: { key: "common:actions.copySummary" },
          text: normalizedEntity.summary,
          what: "summary",
        })
      : {
          id: "meta-edge:copy-summary",
          label: { key: "common:actions.copySummary" },
          section: "copy",
          disabled: true,
          disabledReason: {
            key: "graph:disabledReasons.chooseConnectionWithSummary",
          },
        },
    // A meta-connection is a transient aggregated ribbon with no user-level
    // reference, so its raw internal id is never copied to the user-facing
    // clipboard (context-menu-copy-safety CMCS-001); the action is omitted.
  ];
}

registerResolver("meta-edge", metaEdgeMenu as ActionResolver);
