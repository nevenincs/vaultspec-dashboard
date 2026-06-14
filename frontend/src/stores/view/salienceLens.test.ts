// graph-node-salience W04.P09.S41: the active-salience-lens view store and the
// stores-layer derivations over it — the default + setter, the lens-keyed query
// cache (a lens switch is a re-query), the focus-change loading state, and the
// tiers-based degradation read (never from a bare transport error).

import { beforeEach, describe, expect, it } from "vitest";

import { EngineError, type GraphSlice } from "../server/engine";
import { deriveSalienceSliceView, engineKeys } from "../server/queries";
import { DEFAULT_SALIENCE_LENS, useSalienceLensStore } from "./salienceLens";

function resetStore() {
  useSalienceLensStore.setState({ lens: DEFAULT_SALIENCE_LENS, focus: null });
}

describe("the active salience lens store", () => {
  beforeEach(resetStore);

  it("defaults to the status lens (ADR: status is the default)", () => {
    expect(useSalienceLensStore.getState().lens).toBe("status");
    expect(DEFAULT_SALIENCE_LENS).toBe("status");
    expect(useSalienceLensStore.getState().focus).toBeNull();
  });

  it("switches the active lens via the setter", () => {
    useSalienceLensStore.getState().setLens("design");
    expect(useSalienceLensStore.getState().lens).toBe("design");
    useSalienceLensStore.getState().setLens("status");
    expect(useSalienceLensStore.getState().lens).toBe("status");
  });

  it("sets and clears the DOI focus node", () => {
    useSalienceLensStore.getState().setFocus("doc:x-plan");
    expect(useSalienceLensStore.getState().focus).toBe("doc:x-plan");
    useSalienceLensStore.getState().setFocus(null);
    expect(useSalienceLensStore.getState().focus).toBeNull();
  });
});

describe("the lens-keyed graph query cache", () => {
  it("keys the graph query on the active lens so a lens switch is a re-query", () => {
    const statusKey = engineKeys.graph("s", undefined, undefined, "document", "status");
    const designKey = engineKeys.graph("s", undefined, undefined, "document", "design");
    // The two lenses produce DIFFERENT cache keys: a lens switch re-queries
    // rather than serving a stale other-lens slice.
    expect(statusKey).not.toEqual(designKey);
    expect(statusKey).toContain("status");
    expect(designKey).toContain("design");
  });

  it("keys the graph query on the focus node so a focus change is a re-query", () => {
    const noFocus = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      null,
    );
    const focused = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      "doc:x",
    );
    expect(noFocus).not.toEqual(focused);
    expect(focused).toContain("doc:x");
  });

  it("the omitted lens/focus keys to the status, no-focus default", () => {
    const omitted = engineKeys.graph("s");
    const explicit = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      null,
    );
    expect(omitted).toEqual(explicit);
  });
});

describe("the salience slice view (loading + degradation from tiers)", () => {
  const okTiers = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports loading on a focus-change re-query without flagging partial", () => {
    const view = deriveSalienceSliceView("status", undefined, null, true);
    expect(view.loading).toBe(true);
    expect(view.partial).toBe(false);
    expect(view.degradedTiers).toEqual([]);
  });

  it("honors the engine's explicit salience_partial flag", () => {
    const data = {
      nodes: [],
      edges: [],
      tiers: okTiers,
      lens: "status",
      salience_partial: true,
    } as unknown as GraphSlice;
    const view = deriveSalienceSliceView("status", data, null, false);
    expect(view.partial).toBe(true);
    expect(view.lens).toBe("status");
  });

  it("derives partial from a degraded tier in the served block", () => {
    const data = {
      nodes: [],
      edges: [],
      tiers: {
        ...okTiers,
        declared: { available: false, reason: "core graph unavailable" },
      },
      lens: "design",
      salience_partial: false,
    } as unknown as GraphSlice;
    const view = deriveSalienceSliceView("design", data, null, false);
    // A degraded backbone tier makes the ranking partial even if the engine's
    // flag was not set — degradation is read from tiers.
    expect(view.partial).toBe(true);
    expect(view.degradedTiers).toContain("declared");
    expect(view.reasons.declared).toBe("core graph unavailable");
  });

  it("lets FRESH error tiers win over a stale held-success block", () => {
    const held = {
      nodes: [],
      edges: [],
      tiers: okTiers,
      lens: "status",
      salience_partial: false,
    } as unknown as GraphSlice;
    // The latest request errored with a tiers-bearing envelope marking semantic
    // down — that fresh error truth wins over the stale held-success block.
    const error = new EngineError("/graph/query", 502, {
      tiers: {
        ...okTiers,
        semantic: { available: false, reason: "rag down" },
      },
    });
    const view = deriveSalienceSliceView("status", held, error, false);
    expect(view.degradedTiers).toContain("semantic");
    expect(view.reasons.semantic).toBe("rag down");
  });

  it("does NOT flag partial from a bare transport error (no tiers)", () => {
    // A tiers-less transport fault is the query's error state, not a degraded
    // ranking — partiality is never inferred from a bare error.
    const error = new Error("network down");
    const view = deriveSalienceSliceView("status", undefined, error, false);
    expect(view.partial).toBe(false);
    expect(view.degradedTiers).toEqual([]);
  });
});
