// Center-slot reconciliation tests (agent-panel-shell-integration D1), mirroring
// the coverage the graph panel's own toggle carried. The slot is the seam the ADR
// flags as historically subtle (panel-restore races), so the rules are pinned here
// on the pure plan rather than inferred from a rendered dockview.
//
// Canvas safety, stated honestly: this layer cannot prove DOM identity, because
// the WebGL canvas is not a dockview panel at all — `GraphCanvasHost` is an
// app-lifetime SIBLING of the whole dockview container and the `__graph__` panel is
// only an empty rect placeholder. What this file pins is the property that makes
// that design hold: a slot flip touches ONLY reserved panel ids, and leaving the
// graph slot is byte-for-byte the same operation as the graph hide that was already
// canvas-safe. The pin-level transition is asserted in the sibling `canvasPin`
// coverage; nothing here may add, remove, or re-parent the canvas host.

import { describe, expect, it } from "vitest";

import {
  AGENT_PANEL_ID,
  GRAPH_PANEL_ID,
  RESERVED_PANEL_IDS,
  deriveCenterSlotPlan,
  isCenterSlotSettled,
  isReservedPanel,
  reservedPanelIdFor,
} from "./centerSlotPlan";

describe("reserved panel identity", () => {
  it("names both occupants and nothing else", () => {
    expect(RESERVED_PANEL_IDS).toEqual([GRAPH_PANEL_ID, AGENT_PANEL_ID]);
    expect(isReservedPanel(GRAPH_PANEL_ID)).toBe(true);
    expect(isReservedPanel(AGENT_PANEL_ID)).toBe(true);
    // Document panel ids are node ids; the reserved ids are double-underscored so
    // they cannot collide with one.
    expect(isReservedPanel("doc:a")).toBe(false);
    expect(isReservedPanel("code:src/app.ts")).toBe(false);
  });

  it("maps each slot verb to its occupant, and the empty slot to none", () => {
    expect(reservedPanelIdFor("graph")).toBe(GRAPH_PANEL_ID);
    expect(reservedPanelIdFor("agent")).toBe(AGENT_PANEL_ID);
    expect(reservedPanelIdFor("none")).toBeNull();
  });
});

describe("center slot reconciliation plan", () => {
  it("does nothing when the wanted occupant already holds the slot", () => {
    // The early-out matters for the canvas: a re-render that leaves the slot alone
    // must NOT tear the graph placeholder down and rebuild it.
    const plan = deriveCenterSlotPlan([GRAPH_PANEL_ID, "doc:a"], "graph");
    expect(plan).toEqual({ removeIds: [], addId: null });
    expect(isCenterSlotSettled(plan)).toBe(true);

    const empty = deriveCenterSlotPlan(["doc:a"], "none");
    expect(isCenterSlotSettled(empty)).toBe(true);
  });

  it("swaps occupants by removing the incumbent before adding the wanted one", () => {
    const toAgent = deriveCenterSlotPlan([GRAPH_PANEL_ID, "doc:a"], "agent");
    expect(toAgent).toEqual({ removeIds: [GRAPH_PANEL_ID], addId: AGENT_PANEL_ID });

    const toGraph = deriveCenterSlotPlan([AGENT_PANEL_ID, "doc:a"], "graph");
    expect(toGraph).toEqual({ removeIds: [AGENT_PANEL_ID], addId: GRAPH_PANEL_ID });
  });

  it("empties the slot without adding anything", () => {
    expect(deriveCenterSlotPlan([GRAPH_PANEL_ID], "none")).toEqual({
      removeIds: [GRAPH_PANEL_ID],
      addId: null,
    });
    expect(deriveCenterSlotPlan([AGENT_PANEL_ID], "none")).toEqual({
      removeIds: [AGENT_PANEL_ID],
      addId: null,
    });
  });

  it("fills an empty slot without removing anything", () => {
    expect(deriveCenterSlotPlan(["doc:a"], "agent")).toEqual({
      removeIds: [],
      addId: AGENT_PANEL_ID,
    });
    expect(deriveCenterSlotPlan([], "graph")).toEqual({
      removeIds: [],
      addId: GRAPH_PANEL_ID,
    });
  });

  it("resolves a restore race that left BOTH occupants docked", () => {
    // The exclusivity rule is enforced against the arrangement it FINDS, not against
    // the transition it expected: if a restore raced both reserved panels in, the
    // plan drops the one that does not belong and keeps the wanted one in place
    // (no needless remove-then-add of the occupant that is already correct).
    const toGraph = deriveCenterSlotPlan([GRAPH_PANEL_ID, AGENT_PANEL_ID], "graph");
    expect(toGraph).toEqual({ removeIds: [AGENT_PANEL_ID], addId: null });

    const toAgent = deriveCenterSlotPlan([GRAPH_PANEL_ID, AGENT_PANEL_ID], "agent");
    expect(toAgent).toEqual({ removeIds: [GRAPH_PANEL_ID], addId: null });

    // An empty slot evicts both.
    expect(deriveCenterSlotPlan([GRAPH_PANEL_ID, AGENT_PANEL_ID], "none")).toEqual({
      removeIds: [GRAPH_PANEL_ID, AGENT_PANEL_ID],
      addId: null,
    });
  });

  it("never touches a document panel in any transition", () => {
    // The slot must be unable to close a user's document — and equally unable to
    // name anything outside the reserved set, which is what keeps the canvas host
    // (not a panel at all) out of every flip.
    const docs = ["doc:a", "code:src/app.ts", "doc:b"];
    for (const present of [
      [...docs],
      [GRAPH_PANEL_ID, ...docs],
      [AGENT_PANEL_ID, ...docs],
      [GRAPH_PANEL_ID, AGENT_PANEL_ID, ...docs],
    ]) {
      for (const slot of ["graph", "agent", "none"] as const) {
        const plan = deriveCenterSlotPlan(present, slot);
        for (const id of plan.removeIds) expect(isReservedPanel(id)).toBe(true);
        expect(plan.addId === null || isReservedPanel(plan.addId)).toBe(true);
      }
    }
  });

  it("makes leaving the graph slot identical to hiding the graph", () => {
    // Whichever way the graph leaves the center — the agent panel taking the slot or
    // the slot emptying — the graph-side operation is the SAME single removal that
    // the shipped hide already performed, so no new canvas path is introduced.
    const hidden = deriveCenterSlotPlan([GRAPH_PANEL_ID, "doc:a"], "none");
    const displaced = deriveCenterSlotPlan([GRAPH_PANEL_ID, "doc:a"], "agent");
    expect(displaced.removeIds).toEqual(hidden.removeIds);
  });
});
