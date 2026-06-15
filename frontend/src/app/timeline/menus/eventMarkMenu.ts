// The timeline event-mark context menu (dashboard-context-menus ADR, W03.P09):
// the per-surface resolver for an `event` entity — a right-clicked timeline mark.
// It is a pure `(entity, ctx) => ActionDescriptor[]` registered against the
// "event" kind at module load (the contributed-menus model), so the generic menu
// host derives this surface's menu without knowing the timeline exists.
//
// Layer: app-chrome. The actions emit through the shared selection intent
// (`selectEvent` / `selectNode`) and the timeline's own view store
// (`useTimelineStore.setWindow`) — read-only navigation over the one model, never
// a fetch and never the raw `tiers` block (dashboard-layer-ownership,
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
import type { EventEntity } from "../../../platform/actions/entity";
import {
  registerResolver,
  type ActionContext,
} from "../../../platform/actions/registry";
import { selectEvent, selectNode } from "../../../stores/view/selection";
import { useTimelineStore } from "../Timeline";

/**
 * The span the "Zoom timeline to event" action opens around the event instant:
 * a tight, legible window (one day) centered on the mark, well inside the store's
 * clamp band. Pure constant so the resolver stays side-effect-free until run.
 */
const ZOOM_SPAN_MS = 24 * 3600 * 1000;

/** Set the timeline window to a tight span centered on a fixed instant. */
function zoomTimelineTo(ts: number): void {
  const half = ZOOM_SPAN_MS / 2;
  const now = Date.now();
  let from = ts - half;
  let to = ts + half;
  // Keep the window inside the present (the store clamps to "now" too).
  if (to > now) {
    to = now;
    from = to - ZOOM_SPAN_MS;
  }
  useTimelineStore.getState().setWindow({ from, to });
}

/**
 * The menu for a timeline event mark. Pure: returns descriptors whose `run`
 * closures capture the entity; nothing fires until the host activates an item.
 */
export function eventMarkMenu(
  entity: EventEntity,
  _ctx: ActionContext,
): ActionDescriptor[] {
  const hasNodes = entity.nodeIds.length > 0;
  const truncated =
    entity.truncatedNodeIds !== undefined && entity.truncatedNodeIds > 0;
  const hasTs = entity.ts !== undefined;

  const actions: ActionDescriptor[] = [
    {
      id: `event:show-touched:${entity.id}`,
      label: "Show touched nodes",
      section: "navigate",
      icon: Crosshair,
      run: () => selectEvent(entity.id, entity.nodeIds, entity.truncatedNodeIds),
    },
    {
      id: `event:jump-first:${entity.id}`,
      label: "Jump to first node",
      section: "navigate",
      icon: Locate,
      disabled: !hasNodes,
      disabledReason: hasNodes ? undefined : "no touched nodes",
      run: hasNodes ? () => selectNode(entity.nodeIds[0]) : undefined,
    },
    {
      id: `event:zoom:${entity.id}`,
      label: "Zoom timeline to event",
      section: "navigate",
      icon: Maximize2,
      disabled: !hasTs,
      disabledReason: hasTs ? undefined : "zoom unavailable",
      run: hasTs ? () => zoomTimelineTo(entity.ts as number) : undefined,
    },
    {
      id: `event:show-full-list:${entity.id}`,
      label: "Show full node list",
      section: "navigate",
      icon: ListTree,
      disabled: !truncated,
      disabledReason: truncated ? undefined : "all nodes shown",
      // No client-side full list to expand to (the engine capped the ids); the
      // honest action when truncated is to select the event so its carried ids
      // surface in the inspector. A no-op would lie about doing something.
      run: truncated
        ? () => selectEvent(entity.id, entity.nodeIds, entity.truncatedNodeIds)
        : undefined,
    },
    copyAction({
      id: `event:copy-id:${entity.id}`,
      label: "Copy event id",
      text: entity.id,
      what: "id",
    }),
  ];

  // Copy timestamp: only when the mark carries an instant.
  if (hasTs) {
    actions.push(
      copyAction({
        id: `event:copy-ts:${entity.id}`,
        label: "Copy timestamp",
        text: String(entity.ts),
      }),
    );
  } else {
    actions.push({
      id: `event:copy-ts:${entity.id}`,
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
registerResolver("event", eventMarkMenu);
