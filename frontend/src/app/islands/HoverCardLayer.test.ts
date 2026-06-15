// Pure-logic tests for the hover-card host (node-visual-richness P04): the
// hover-id view slice, the dwell→suppress resolution, and the compact card
// projection. No DOM — these exercise the host's pure seams and the store slice
// directly, isolating the three-intent separation and the open-suppression law
// from the timer/render machinery (covered in the .render.test.tsx).

import { afterEach, describe, expect, it } from "vitest";

import type { EngineNode } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import { cardModelFromNode, resolveHoverTarget } from "./HoverCardLayer";

afterEach(() => {
  // Reset the hover slice + opened set between cases (the store is a singleton).
  useViewStore.setState({ hoveredId: null, openedIds: [] });
});

describe("viewStore hover slice (P04.S14)", () => {
  it("sets the hovered id and clears it on null", () => {
    const { setHoveredId } = useViewStore.getState();
    setHoveredId("doc:adr-1");
    expect(useViewStore.getState().hoveredId).toBe("doc:adr-1");
    setHoveredId(null);
    expect(useViewStore.getState().hoveredId).toBeNull();
  });

  it("short-circuits an identical write (no churn) but does change on a new id", () => {
    const { setHoveredId } = useViewStore.getState();
    setHoveredId("doc:adr-1");
    const first = useViewStore.getState();
    setHoveredId("doc:adr-1");
    // Same id → same state object (no re-set, so subscribers do not churn).
    expect(useViewStore.getState()).toBe(first);
    setHoveredId("doc:adr-2");
    expect(useViewStore.getState().hoveredId).toBe("doc:adr-2");
  });

  it("is a DISTINCT concept from selection and opened (the three intents)", () => {
    const store = useViewStore.getState();
    store.setHoveredId("doc:adr-1");
    // Hovering one node must not select it nor open it.
    expect(useViewStore.getState().selection).toBeNull();
    expect(useViewStore.getState().selectedId).toBeNull();
    expect(useViewStore.getState().openedIds).toEqual([]);
  });
});

describe("resolveHoverTarget — dwell gate + open suppression (P04.S15)", () => {
  it("returns null when nothing is dwelled", () => {
    expect(resolveHoverTarget(null, [])).toBeNull();
  });

  it("returns the dwelled id when it is not opened", () => {
    expect(resolveHoverTarget("doc:adr-1", ["doc:other"])).toBe("doc:adr-1");
  });

  it("SUPPRESSES the card when the dwelled id is already opened", () => {
    // The opened interior already shows everything the card would — no coexistence.
    expect(resolveHoverTarget("doc:adr-1", ["doc:adr-1"])).toBeNull();
  });
});

describe("cardModelFromNode — compact projection (P04.S16)", () => {
  const adr: EngineNode = {
    id: "doc:2026-01-05-editor-demo-adr",
    kind: "adr",
    title: "Editor demo adr",
    status_value: "accepted",
    status_class: "affirmed",
    authority_class: "design",
    lifecycle: { state: "complete" },
  };

  it("projects id, kind, title, status (via the scene util), and authority class", () => {
    const model = cardModelFromNode(adr);
    expect(model.id).toBe(adr.id);
    expect(model.kind).toBe("adr");
    expect(model.title).toBe("Editor demo adr");
    expect(model.status).toEqual({
      value: "accepted",
      class: "affirmed",
      ordinal: undefined,
    });
    expect(model.authorityClass).toBe("design");
  });

  it("feeds the rollout bar ONLY when the node carries lifecycle progress", () => {
    const plan: EngineNode = {
      id: "doc:plan-1",
      kind: "plan",
      title: "A plan",
      status_value: "L2",
      status_class: "tiered",
      lifecycle: { state: "active", progress: { done: 3, total: 8 } },
    };
    expect(cardModelFromNode(plan).progress).toEqual({ done: 3, total: 8 });
    // No progress channel → undefined (the bar does not render).
    expect(cardModelFromNode(adr).progress).toBeUndefined();
  });

  it("falls back to the id for the title and carries no status when absent", () => {
    const bare: EngineNode = { id: "doc:research-1", kind: "research" };
    const model = cardModelFromNode(bare);
    expect(model.title).toBe("doc:research-1");
    expect(model.status).toBeUndefined();
    expect(model.progress).toBeUndefined();
  });
});
