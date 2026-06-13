// Adapter tests against samples CAPTURED from the live serve origin
// (vaultspec serve, 2026-06-13) — the S49 contract-shape verification in
// executable form. Tolerance is tested too: internal-shape (mock) bodies
// pass through unchanged.

import { describe, expect, it } from "vitest";

import {
  adaptFilters,
  adaptGraphSlice,
  adaptMap,
  adaptStatus,
  adaptVaultTree,
  docTypeFromStem,
  metaEdgeToEdge,
  unwrapEnvelope,
} from "./liveAdapters";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: false, reason: "rag service down" },
};

describe("unwrapEnvelope", () => {
  it("unwraps {data, tiers} onto the flat internal shape", () => {
    const flat = unwrapEnvelope({ data: { ok: true, x: 1 }, tiers: TIERS }) as {
      ok: boolean;
      x: number;
      tiers: typeof TIERS;
    };
    expect(flat.ok).toBe(true);
    expect(flat.x).toBe(1);
    expect(flat.tiers.semantic.available).toBe(false);
  });

  it("unwraps the events family's payload nesting", () => {
    const flat = unwrapEnvelope({
      data: { payload: { buckets: [1] }, shape: "bucketed" },
      tiers: TIERS,
    }) as { buckets: number[] };
    expect(flat.buckets).toEqual([1]);
  });

  it("passes flat (mock) bodies through unchanged", () => {
    const body = { entries: [], tiers: TIERS };
    expect(unwrapEnvelope(body)).toBe(body);
  });
});

describe("adaptMap (live workspace sample)", () => {
  const live = {
    branches: [{ class: "default", name: "main" }],
    corpus_views: [{ head_ref: "refs/heads/main", worktree: "Y:/repo" }],
    remote_refs: [],
    scope_token_format: "absolute worktree path, forward slashes",
    workspace: "Y:/repo/.git",
    worktrees: [
      {
        dirty: true,
        has_vault: true,
        head_ref: "refs/heads/main",
        is_main: true,
        path: "Y:/repo",
      },
    ],
    tiers: TIERS,
  };

  it("maps worktrees with the path as the scope token id", () => {
    const adapted = adaptMap(live);
    const wt = adapted.repositories[0].worktrees[0];
    expect(wt.id).toBe("Y:/repo");
    expect(wt.branch).toBe("main");
    expect(wt.has_vault).toBe(true);
    expect(wt.is_default).toBe(true);
    expect(adapted.repositories[0].branches[0]).toEqual({
      name: "main",
      kind: "default",
    });
  });

  it("passes the internal repositories shape through", () => {
    const internal = { repositories: [], tiers: TIERS };
    expect(adaptMap(internal)).toBe(internal);
  });
});

describe("adaptStatus (live rollup sample)", () => {
  const live = {
    backends: { core: { invocation: "vaultspec-core" }, rag: { available: false } },
    index: { edges: 834, generation: 2, nodes: 142 },
    last_seq: 1809,
    ok: true,
    scope: "Y:/repo",
    watcher: { mode: "resident", running: true },
    tiers: TIERS,
  };

  it("rolls the index and backends onto the internal status", () => {
    const adapted = adaptStatus(live);
    expect(adapted.ok).toBe(true);
    expect(adapted.nodes).toBe(142);
    expect(adapted.edges).toBe(834);
    expect(adapted.degradations).toEqual(["semantic"]);
    expect(adapted.core?.reachable).toBe(true);
    expect(adapted.rag?.service).toBe("stopped");
    expect(adapted.git).toBeUndefined(); // not served — flagged divergence
  });
});

describe("adaptFilters (live vocabulary sample)", () => {
  it("unwraps the vocabulary wrapper", () => {
    const adapted = adaptFilters({
      vocabulary: {
        feature_tags: ["dashboard-gui"],
        kinds: ["document"],
        relations: ["mentions"],
        structural_states: ["resolved", "stale", "broken"],
        tiers: ["declared", "structural", "temporal", "semantic"],
      },
      tiers: TIERS,
    });
    expect(adapted.feature_tags).toEqual(["dashboard-gui"]);
    expect(adapted.relations).toEqual(["mentions"]);
    expect(adapted.doc_types).toEqual([]);
  });
});

describe("adaptGraphSlice (live constellation sample, 2026-06-13)", () => {
  // Captured verbatim from `vaultspec serve` over this repo's own vault at
  // feature granularity: feature-convergence nodes, edges EMPTY, and the
  // relationships in a SEPARATE meta_edges array (engine addendum S02). This
  // is the exact shape conformance.rs asserts engine-side.
  const liveFeatureSlice = {
    nodes: [
      {
        id: "feature:dashboard-foundation",
        kind: "feature",
        title: "dashboard-foundation",
        member_count: 5,
        degree_by_tier: { structural: 36 },
        lifecycle: null,
      },
      {
        id: "feature:dashboard-gui",
        kind: "feature",
        title: "dashboard-gui",
        member_count: 67,
        degree_by_tier: { structural: 590 },
        lifecycle: { state: "complete", progress: { done: 50, total: 50 } },
      },
    ],
    edges: [],
    meta_edges: [
      {
        src: "feature:dashboard-foundation",
        dst: "feature:dashboard-gui",
        src_feature: "dashboard-foundation",
        dst_feature: "dashboard-gui",
        count: 2,
        breakdown_by_tier: { structural: 2 },
      },
    ],
    filter: {},
    as_of: null,
    tiers: TIERS,
  };

  it("folds the separate meta_edges array into edges (the GUI reads edges)", () => {
    const slice = adaptGraphSlice(liveFeatureSlice);
    // The live edges[] is empty; every rendered edge comes from the fold.
    expect(slice.edges).toHaveLength(1);
    const edge = slice.edges[0];
    expect(edge.src).toBe("feature:dashboard-foundation");
    expect(edge.dst).toBe("feature:dashboard-gui");
    expect(edge.meta).toEqual({ count: 2, breakdown_by_tier: { structural: 2 } });
    // The raw array is consumed, not leaked onto the consumer slice.
    expect(slice.meta_edges).toBeUndefined();
    // Feature nodes and their member_count survive untouched.
    expect(slice.nodes[1].member_count).toBe(67);
  });

  it("synthesizes a stable id, relation, and dominant tier for a meta-edge", () => {
    const edge = metaEdgeToEdge({
      src: "feature:a",
      dst: "feature:b",
      src_feature: "a",
      dst_feature: "b",
      count: 7,
      breakdown_by_tier: { structural: 2, semantic: 5 },
    });
    expect(edge.id).toBe("meta:feature:a->feature:b");
    expect(edge.relation).toBe("related");
    // Dominant tier = the breakdown's heaviest tier (semantic here).
    expect(edge.tier).toBe("semantic");
  });

  const meta = (breakdown: Record<string, number>) => ({
    src: "feature:a",
    dst: "feature:b",
    src_feature: "a",
    dst_feature: "b",
    count: 1,
    breakdown_by_tier: breakdown,
  });

  it("resolves a dominant-tier tie by canonical order", () => {
    // structural and temporal tie at 2 → the earlier canonical tier wins.
    expect(metaEdgeToEdge(meta({ structural: 2, temporal: 2 })).tier).toBe(
      "structural",
    );
    // declared precedes semantic; equal counts → declared.
    expect(metaEdgeToEdge(meta({ declared: 3, semantic: 3 })).tier).toBe("declared");
  });

  it("falls back to structural for an empty/all-zero breakdown", () => {
    expect(metaEdgeToEdge(meta({})).tier).toBe("structural");
    expect(metaEdgeToEdge(meta({ declared: 0, semantic: 0 })).tier).toBe("structural");
  });

  it("passes a document-granularity slice through unchanged (tolerance)", () => {
    // edges populated, meta_edges empty/absent: the fold is a no-op.
    const docSlice = {
      nodes: [{ id: "doc:x", kind: "document" }],
      edges: [
        {
          id: "e:1",
          src: "doc:x",
          dst: "doc:y",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
      ],
      meta_edges: [],
      tiers: TIERS,
    };
    const slice = adaptGraphSlice(docSlice);
    expect(slice.edges).toHaveLength(1);
    expect(slice.edges[0].meta).toBeUndefined();
  });
});

describe("adaptVaultTree (live stem entries)", () => {
  it("derives paths and doc types from stems", () => {
    const adapted = adaptVaultTree({
      entries: [
        {
          feature_tags: ["dashboard-gui"],
          node_id: "doc:2026-06-12-dashboard-gui-adr",
          stem: "2026-06-12-dashboard-gui-adr",
        },
        {
          feature_tags: ["dashboard-gui"],
          node_id: "doc:2026-06-12-dashboard-gui-W01-P01-S01",
          stem: "2026-06-12-dashboard-gui-W01-P01-S01",
        },
      ],
      tiers: TIERS,
    });
    expect(adapted.entries[0]).toMatchObject({
      path: ".vault/adr/2026-06-12-dashboard-gui-adr.md",
      doc_type: "adr",
    });
    expect(adapted.entries[1].doc_type).toBe("exec");
  });

  it("derives the full stem-suffix vocabulary", () => {
    expect(docTypeFromStem("2026-06-12-x-plan")).toBe("plan");
    expect(docTypeFromStem("2026-06-12-x-research")).toBe("research");
    expect(docTypeFromStem("2026-06-12-x-P01-summary")).toBe("exec");
    expect(docTypeFromStem("dashboard-gui.index")).toBe("index");
    expect(docTypeFromStem("mystery")).toBe("document");
  });
});
