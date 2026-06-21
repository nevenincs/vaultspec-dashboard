// The timeline event-mark context menu (dashboard-context-menus ADR, W03.P09):
// the per-surface resolver for an `event` entity — a right-clicked timeline mark.
// It is a pure `(entity, ctx) => ActionDescriptor[]` registered against the
// "event" kind at module load (the contributed-menus model), so the generic menu
// host derives this surface's menu without knowing the timeline exists.
//
// Layer: app-chrome. The actions emit through the shared selection intent
// (`selectEventNodes` / `selectFirstNode`) and the timeline's local scroll-strip
// viewport state — read-only navigation over the one model, never a fetch and
// never the raw `tiers` block (dashboard-layer-ownership,
// views-are-projections-of-one-model). Every action here is non-mutating, so none
// carries `disabledInTimeTravel`: timeline navigation is honest in time-travel.
//
// Honest disabling (disabled-with-reason): an action that cannot run in the
// current context exists but is dimmed with a stated reason rather than vanishing
// — "Jump to first node" with no nodes, "Show full node list" when nothing was
// truncated, and "copy timestamp" with no timestamp.

import { Crosshair, ListTree, Locate, Maximize2 } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import {
  type ActionResolver,
  registerResolver,
  type ActionContext,
} from "../../../platform/actions/registry";
import { menuEntityScope } from "../../../stores/view/menuActions";
import { selectEventNodes, selectFirstNode } from "../../../stores/view/selection";
import { zoomTimelineNavigationToInstant } from "../../../stores/view/timelineIntent";

/** Zoom the scroll-strip viewport to a tight span centered on a fixed instant. */
function zoomTimelineTo(ts: number): void {
  zoomTimelineNavigationToInstant(ts);
}

/**
 * The menu for a timeline event mark. Pure: returns descriptors whose `run`
 * closures capture the entity; nothing fires until the host activates an item.
 */
export function eventMarkMenu(
  entity: unknown,
  _ctx: ActionContext,
): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "event") return [];

  const hasNodes = normalizedEntity.nodeIds.length > 0;
  const truncated =
    normalizedEntity.truncatedNodeIds !== undefined &&
    normalizedEntity.truncatedNodeIds > 0;
  const hasTs = normalizedEntity.ts !== undefined;

  const actions: ActionDescriptor[] = [
    {
      id: `event:show-touched:${normalizedEntity.id}`,
      label: "Show touched nodes",
      section: "navigate",
      icon: Crosshair,
      run: () =>
        void selectEventNodes(
          normalizedEntity.id,
          normalizedEntity.nodeIds,
          menuEntityScope(normalizedEntity),
          normalizedEntity.truncatedNodeIds,
        ),
    },
    hasNodes
      ? {
          id: `event:jump-first:${normalizedEntity.id}`,
          label: "Jump to first node",
          section: "navigate",
          icon: Locate,
          disabled: false,
          run: () =>
            selectFirstNode(
              normalizedEntity.nodeIds,
              menuEntityScope(normalizedEntity),
            ),
        }
      : {
          id: `event:jump-first:${normalizedEntity.id}`,
          label: "Jump to first node",
          section: "navigate",
          icon: Locate,
          disabled: true,
          disabledReason: "no touched nodes",
        },
    hasTs
      ? {
          id: `event:zoom:${normalizedEntity.id}`,
          label: "Zoom timeline to event",
          section: "navigate",
          icon: Maximize2,
          disabled: false,
          run: () => zoomTimelineTo(normalizedEntity.ts as number),
        }
      : {
          id: `event:zoom:${normalizedEntity.id}`,
          label: "Zoom timeline to event",
          section: "navigate",
          icon: Maximize2,
          disabled: true,
          disabledReason: "zoom unavailable",
        },
    truncated
      ? {
          id: `event:show-full-list:${normalizedEntity.id}`,
          label: "Show full node list",
          section: "navigate",
          icon: ListTree,
          disabled: false,
          // No client-side full list to expand to (the engine capped the ids); the
          // honest action when truncated is to select the event so its carried ids
          // surface in the inspector. A no-op would lie about doing something.
          run: () =>
            void selectEventNodes(
              normalizedEntity.id,
              normalizedEntity.nodeIds,
              menuEntityScope(normalizedEntity),
              normalizedEntity.truncatedNodeIds,
            ),
        }
      : {
          id: `event:show-full-list:${normalizedEntity.id}`,
          label: "Show full node list",
          section: "navigate",
          icon: ListTree,
          disabled: true,
          disabledReason: "all nodes shown",
        },
    copyAction({
      id: `event:copy-id:${normalizedEntity.id}`,
      label: "Copy event id",
      text: normalizedEntity.id,
      what: "id",
    }),
    hasNodes
      ? copyAction({
          id: `event:copy-touched:${normalizedEntity.id}`,
          label: "Copy touched node ids",
          text: normalizedEntity.nodeIds.join("\n"),
        })
      : {
          id: `event:copy-touched:${normalizedEntity.id}`,
          label: "Copy touched node ids",
          section: "copy",
          disabled: true,
          disabledReason: "no touched nodes",
        },
  ];

  // Copy timestamp: only when the mark carries an instant.
  if (hasTs) {
    actions.push(
      copyAction({
        id: `event:copy-ts:${normalizedEntity.id}`,
        label: "Copy timestamp",
        text: String(normalizedEntity.ts),
      }),
    );
  } else {
    actions.push({
      id: `event:copy-ts:${normalizedEntity.id}`,
      label: "Copy timestamp",
      section: "copy",
      disabled: true,
      disabledReason: "no timestamp",
    });
  }

  return actions;
}

// Contribute this surface's resolver at module load (the contributed-menus
// model): importing the timeline registers its event menu with the generic host.
registerResolver("event", eventMarkMenu as ActionResolver);
