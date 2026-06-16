// Pure-logic tests for the hover-card host (figma-parity-reconciliation
// W03.P08.S50; binding graph/HoverCard 84:2): the hover-id view slice, the
// dwell→suppress resolution, and the binding evidence-driven card projection. No
// DOM — these exercise the host's pure seams and the store slice directly,
// isolating the three-intent separation, the open-suppression law, and the
// identity+evidence fold from the timer/render machinery (covered in the
// .render.test.tsx).

import { afterEach, describe, expect, it } from "vitest";

import type { EngineNode, NodeEvidence } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import { cardModelFromEvidence, resolveHoverTarget } from "./HoverCardLayer";

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

describe("cardModelFromEvidence — binding identity+evidence projection (S50)", () => {
  const adr: EngineNode = {
    id: "doc:2026-01-05-editor-demo-adr",
    kind: "adr",
    title: "Editor demo adr",
    status_value: "accepted",
    status_class: "affirmed",
    authority_class: "design",
    lifecycle: { state: "complete" },
  };

  const tiers = {} as NodeEvidence["tiers"];

  const evidence: NodeEvidence = {
    documents: [{ path: ".vault/research/2026-foo-research.md", doc_type: "research" }],
    code_locations: [
      { path: "src/lib.rs", symbol: "build", line: 42, state: "resolved" },
    ],
    commits: [{ sha: "abcdef1234", subject: "land it" }],
    tiers,
  };

  it("projects id, kind, title, and the scene category", () => {
    const model = cardModelFromEvidence(adr, evidence);
    expect(model.id).toBe(adr.id);
    expect(model.kind).toBe("adr");
    expect(model.title).toBe("Editor demo adr");
    expect(model.category).toBe("adr");
  });

  it("folds the enriched evidence into the bounded grouped lines", () => {
    const model = cardModelFromEvidence(adr, evidence);
    const headings = model.evidence.map((g) => g.heading);
    expect(headings).toEqual(["documents", "code", "commits"]);
    expect(model.evidence[0].lines[0].label).toBe("2026-foo-research.md");
    expect(model.evidence[1].lines[0].label).toBe("lib.rs#build");
    expect(model.evidence[2].lines[0].label).toBe("abcdef1");
  });

  it("renders identity only (no groups) when evidence is absent or empty", () => {
    expect(cardModelFromEvidence(adr, undefined).evidence).toEqual([]);
    expect(
      cardModelFromEvidence(adr, {
        documents: [],
        code_locations: [],
        commits: [],
        tiers,
      }).evidence,
    ).toEqual([]);
  });

  it("falls back to the id for the title when absent", () => {
    const bare: EngineNode = { id: "doc:research-1", kind: "research" };
    expect(cardModelFromEvidence(bare, undefined).title).toBe("doc:research-1");
  });
});
