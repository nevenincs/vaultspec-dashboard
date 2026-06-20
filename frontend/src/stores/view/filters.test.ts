import { describe, expect, it } from "vitest";

import type { DashboardFilters, EngineEdge, EngineNode } from "../server/engine";
import { SEARCH_QUERY_MAX_CHARS } from "../searchQuery";
import {
  DEFAULT_CHOICES,
  FILTER_CHOICE_LIST_MAX_ITEMS,
  FILTER_CHOICE_VALUE_MAX_CHARS,
  computeVisibility,
  dashboardFiltersFromChoices,
  filterChoicesFromDashboardState,
  normalizeFilterChoices,
  toGraphFilter,
  visibilityHiddenCounts,
  visibilityNodeCounts,
  visibilitySceneCommand,
} from "./filters";
import type { FilterChoices } from "./filters";

const choices = (over: Partial<FilterChoices> = {}): FilterChoices => ({
  ...structuredClone(DEFAULT_CHOICES),
  ...over,
});

const node = (id: string, extra?: Partial<EngineNode>): EngineNode => ({
  id,
  kind: "plan",
  ...extra,
});

const edge = (
  id: string,
  src: string,
  dst: string,
  extra?: Partial<EngineEdge>,
): EngineEdge => ({
  id,
  src,
  dst,
  relation: "implements",
  tier: "declared",
  confidence: 1,
  ...extra,
});

describe("toGraphFilter (R3 wire compile)", () => {
  it("compiles an empty default to an empty wire object", () => {
    expect(toGraphFilter(choices())).toEqual({});
  });

  it("carries per-tier confidence as 0..1 floats and facet lists", () => {
    const wire = toGraphFilter(
      choices({
        tiers: { declared: true, structural: true, temporal: true, semantic: false },
        minConfidence: { semantic: 0.7 },
        structuralStates: ["broken"],
        textMatch: "auth",
      }),
    );
    expect(wire.tiers?.semantic).toBe(false);
    expect(wire.min_confidence).toEqual({ semantic: 0.7 });
    expect(wire.structural_state).toEqual(["broken"]);
    expect(wire.text).toBe("auth");
  });
});

describe("normalizeFilterChoices", () => {
  it("normalizes persisted filter snapshots before they become dashboard intent", () => {
    expect(
      normalizeFilterChoices({
        tiers: { semantic: false, temporal: "off" },
        minConfidence: { semantic: 70, temporal: Number.NaN },
        docTypes: [" adr ", "adr", 12],
        featureTags: [" state ", "state", null],
        relations: [" mentions ", "mentions", false],
        structuralStates: [" broken ", "unknown"],
        textMatch: " boundary ",
        dateRange: { from: "", to: "2026-06-30" },
      }),
    ).toEqual({
      tiers: { declared: true, structural: true, temporal: true, semantic: false },
      minConfidence: { semantic: 1 },
      docTypes: ["adr"],
      featureTags: ["state"],
      relations: ["mentions"],
      structuralStates: ["broken"],
      textMatch: "boundary",
      dateRange: { to: "2026-06-30" },
    });
  });

  it("normalizes dashboard filter choices before saving them back to dashboard state", () => {
    expect(
      dashboardFiltersFromChoices({
        ...DEFAULT_CHOICES,
        docTypes: [" plan ", "plan"],
        featureTags: [" state ", "state"],
        relations: [" references ", "references"],
        structuralStates: [" broken ", "broken"],
        textMatch: " central ",
      }),
    ).toEqual({
      doc_types: ["plan"],
      feature_tags: ["state"],
      relations: ["references"],
      structural_state: ["broken"],
      text: "central",
    });

    expect(
      filterChoicesFromDashboardState({
        filters: {
          doc_types: [" adr ", "adr"],
          feature_tags: [" state ", "state"],
          relations: [" mentions ", "mentions"],
          structural_state: [" broken ", "broken"],
          text: " local ",
        } as unknown as DashboardFilters,
        date_range: {},
      }),
    ).toMatchObject({
      docTypes: ["adr"],
      featureTags: ["state"],
      relations: ["mentions"],
      structuralStates: ["broken"],
      textMatch: "local",
    });
  });

  it("bounds filter choice values, accumulators, and text projections", () => {
    const overlongValue = "x".repeat(FILTER_CHOICE_VALUE_MAX_CHARS + 1);
    const normalized = normalizeFilterChoices({
      ...DEFAULT_CHOICES,
      docTypes: [
        overlongValue,
        ...Array.from(
          { length: FILTER_CHOICE_LIST_MAX_ITEMS + 1 },
          (_, index) => `doc-${index}`,
        ),
      ],
      featureTags: [overlongValue, " feature-a "],
      relations: [overlongValue, " mentions "],
      structuralStates: [
        overlongValue,
        ...Array.from(
          { length: FILTER_CHOICE_LIST_MAX_ITEMS + 1 },
          (_, index) => `invalid-${index}`,
        ),
        " broken ",
      ],
      textMatch: ` graph ${"x".repeat(SEARCH_QUERY_MAX_CHARS)}`,
    });

    expect(normalized).toMatchObject({
      docTypes: expect.arrayContaining(["doc-0"]),
      featureTags: ["feature-a"],
      relations: ["mentions"],
      structuralStates: ["broken"],
    });
    expect(normalized?.docTypes).toHaveLength(FILTER_CHOICE_LIST_MAX_ITEMS);
    expect(normalized?.docTypes).not.toContain(overlongValue);
    expect(normalized?.textMatch).toHaveLength(SEARCH_QUERY_MAX_CHARS);

    const fromDashboardState = filterChoicesFromDashboardState({
      filters: {
        doc_types: [overlongValue, " adr "],
        text: ` state ${"x".repeat(SEARCH_QUERY_MAX_CHARS)}`,
      } as unknown as DashboardFilters,
      date_range: {},
    });
    expect(fromDashboardState.docTypes).toEqual(["adr"]);
    expect(fromDashboardState.textMatch).toHaveLength(SEARCH_QUERY_MAX_CHARS);
  });

  it("normalizes persisted filter date ranges through the dashboard date contract", () => {
    expect(
      normalizeFilterChoices({
        ...DEFAULT_CHOICES,
        dateRange: { from: "2026-06-30", to: "2026-06-01" },
      }),
    ).toEqual(
      expect.objectContaining({
        dateRange: { from: "2026-06-01", to: "2026-06-30" },
      }),
    );
    expect(
      normalizeFilterChoices({
        ...DEFAULT_CHOICES,
        dateRange: { from: "2026-06-01T00:00:00Z", to: "2026-06-30" },
      }),
    ).toEqual(
      expect.objectContaining({
        dateRange: { from: "2026-06-01", to: "2026-06-30" },
      }),
    );
  });

  it("rejects non-object snapshots at the store boundary", () => {
    expect(normalizeFilterChoices(null)).toBeNull();
    expect(normalizeFilterChoices("filters")).toBeNull();
  });
});

describe("computeVisibility (RL-5a membership)", () => {
  const nodes = [
    node("a", { doc_type: "plan", feature_tags: ["auth"], title: "auth plan" }),
    node("b", { doc_type: "adr", feature_tags: ["auth"] }),
    node("c", { doc_type: "plan", feature_tags: ["sync"] }),
  ];
  const edges = [
    edge("e1", "a", "b"),
    edge("e2", "a", "c", { tier: "semantic", confidence: 0.4 }),
    edge("e3", "b", "c", { tier: "structural", state: "broken" }),
  ];

  it("hides edges whose tier is off and counts the cost", () => {
    const v = computeVisibility(
      nodes,
      edges,
      choices({
        tiers: { declared: true, structural: true, temporal: true, semantic: false },
      }),
    );
    expect(v.visibleEdgeIds.has("e2")).toBe(false);
    expect(v.visibleEdgeIds.has("e1")).toBe(true);
    expect(v.hiddenEdgeCount).toBe(1);
  });

  it("applies per-tier confidence floors", () => {
    const v = computeVisibility(
      nodes,
      edges,
      choices({ minConfidence: { semantic: 0.5 } }),
    );
    expect(v.visibleEdgeIds.has("e2")).toBe(false);
  });

  it("filters nodes by facets and drops edges with hidden endpoints", () => {
    const v = computeVisibility(nodes, edges, choices({ featureTags: ["auth"] }));
    expect(v.visibleNodeIds).toEqual(new Set(["a", "b"]));
    expect(v.visibleEdgeIds).toEqual(new Set(["e1"]));
    expect(v.hiddenNodeCount).toBe(1);
  });

  it("powers the show-broken lens via structural state", () => {
    const v = computeVisibility(
      nodes,
      edges,
      choices({ structuralStates: ["broken"] }),
    );
    expect(v.visibleEdgeIds.has("e3")).toBe(true);
    expect(v.visibleEdgeIds.has("e1")).toBe(true); // declared unaffected
  });

  it("text-matches against title or id", () => {
    const v = computeVisibility(nodes, edges, choices({ textMatch: "auth plan" }));
    expect(v.visibleNodeIds).toEqual(new Set(["a"]));
  });

  it("keeps meta-edges while any constituent tier is on", () => {
    const meta = edge("m1", "a", "b", {
      tier: "semantic",
      meta: { count: 3, breakdown_by_tier: { declared: 2, semantic: 1 } },
    });
    const v = computeVisibility(
      nodes,
      [meta],
      choices({
        tiers: { declared: true, structural: true, temporal: true, semantic: false },
      }),
    );
    expect(v.visibleEdgeIds.has("m1")).toBe(true);
  });

  it("projects membership into the locked scene visibility command", () => {
    const v = computeVisibility(nodes, edges, choices({ featureTags: ["auth"] }));

    expect(visibilitySceneCommand(v)).toEqual({
      kind: "set-visibility",
      visibleNodeIds: new Set(["a", "b"]),
      visibleEdgeIds: new Set(["e1"]),
    });
  });

  it("projects hidden and visible counts for stage filter chrome", () => {
    const v = computeVisibility(nodes, edges, choices({ featureTags: ["auth"] }));

    expect(visibilityHiddenCounts(v)).toEqual({ nodes: 1, edges: 2 });
    expect(visibilityHiddenCounts(null)).toEqual({ nodes: 0, edges: 0 });
    expect(visibilityNodeCounts(nodes.length, v)).toEqual({
      visible: 2,
      total: 3,
    });
    expect(visibilityNodeCounts(nodes.length, null)).toEqual({
      visible: 3,
      total: 3,
    });
  });
});
