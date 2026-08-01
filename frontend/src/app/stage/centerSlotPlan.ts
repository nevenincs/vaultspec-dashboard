// The center slot's reconciliation PLAN (agent-panel-shell-integration D1),
// extracted from `DockWorkspace` so the exclusivity rule is unit-testable without a
// live dockview api. The plan is pure: given which reserved panels dockview
// currently holds and which occupant the `centerSlot` shell verb wants, it says
// which to remove and which to add.
//
// The ORDER matters and is part of the contract: removals come first, so a flip
// never has both occupants docked at once — including when a restore race leaves
// both present, which the plan resolves down to the wanted one rather than
// trusting the incoming arrangement.

import type { CenterSlot } from "../../stores/view/shellLayout";

/** The reserved center-slot panel ids (never node ids, so they cannot collide with
 *  a document panel). */
export const GRAPH_PANEL_ID = "__graph__";
export const AGENT_PANEL_ID = "__agent__";
export const RESERVED_PANEL_IDS: readonly string[] = [GRAPH_PANEL_ID, AGENT_PANEL_ID];

/** Whether a panel id belongs to the reserved slot rather than a document. Every
 *  document-facing pass (tab reorder, activation, close, sync plan) filters on it. */
export function isReservedPanel(panelId: string): boolean {
  return RESERVED_PANEL_IDS.includes(panelId);
}

/** The reserved panel id the shell verb wants docked, or `null` for an empty slot. */
export function reservedPanelIdFor(slot: CenterSlot): string | null {
  if (slot === "graph") return GRAPH_PANEL_ID;
  if (slot === "agent") return AGENT_PANEL_ID;
  return null;
}

export interface CenterSlotPlan {
  /** Reserved panels to remove, applied BEFORE the add. */
  removeIds: readonly string[];
  /** The reserved panel to add, or `null` when the wanted occupant is already
   *  docked (or the slot should be empty) — so a no-op flip never re-creates a
   *  panel, and the graph placeholder is never needlessly torn down and rebuilt. */
  addId: string | null;
}

/**
 * Reconcile the reserved panels dockview holds to the wanted center slot.
 *
 * `presentPanelIds` is the full live panel id list (documents included); only the
 * reserved ids in it are considered, so callers can pass `api.panels` straight
 * through.
 */
export function deriveCenterSlotPlan(
  presentPanelIds: readonly string[],
  slot: CenterSlot,
): CenterSlotPlan {
  const wantedId = reservedPanelIdFor(slot);
  const present = RESERVED_PANEL_IDS.filter((id) => presentPanelIds.includes(id));
  return {
    removeIds: present.filter((id) => id !== wantedId),
    addId: wantedId !== null && !present.includes(wantedId) ? wantedId : null,
  };
}

/** Whether a plan would change anything — the effect's early-out, so a re-render
 *  that leaves the slot as it is never enters the dockview mutation path at all. */
export function isCenterSlotSettled(plan: CenterSlotPlan): boolean {
  return plan.removeIds.length === 0 && plan.addId === null;
}
