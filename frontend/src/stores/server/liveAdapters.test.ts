// Adapter tests against samples CAPTURED from the live serve origin
// (vaultspec serve, 2026-06-13) — the S49 contract-shape verification in
// executable form. Tolerance is tested too: internal-shape (mock) bodies
// pass through unchanged.

import { describe, expect, it } from "vitest";

import type { SearchResult } from "./engine";
import {
  adaptFilters,
  adaptGraphSlice,
  adaptMap,
  adaptSearch,
  adaptStatus,
  adaptVaultTree,
  deriveSearchNodeId,
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
    // ID uses JSON-encoded endpoint pair to prevent collisions when endpoint
    // ids contain the "->" separator (wire-01 adversarial finding).
    expect(edge.id).toBe('meta:["feature:a","feature:b"]');
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

describe("adaptGraphSlice ontology fields (graph-node-semantics)", () => {
  // A document-granularity slice in the EXACT shape the live engine's edge_view
  // and node_view now serve: nodes carry the additive `authority_class` register
  // and the `aggregate` hint; edges carry the additive `derivation` label
  // alongside the §4 `relation`/`tier`. Fed through the SAME client path the app
  // uses (adaptGraphSlice), proving the ontology survives the adapter intact
  // (mock-mirrors-live-wire-shape: one code path serves both origins).
  const liveOntologySlice = {
    nodes: [
      {
        id: "doc:2026-06-13-conf-plan",
        kind: "document",
        doc_type: "plan",
        title: "conf plan",
        feature_tags: ["conf-feature"],
        lifecycle: { state: "L2", progress: { done: 1, total: 2 } },
        degree_by_tier: { declared: 1, structural: 1 },
        authority_class: "roadmap",
        aggregate: false,
      },
      {
        id: "doc:2026-06-13-conf-exec-S01",
        kind: "document",
        doc_type: "exec",
        title: "conf exec",
        feature_tags: ["conf-feature"],
        lifecycle: { state: "complete" },
        authority_class: "evidence",
        aggregate: true,
      },
    ],
    edges: [
      {
        id: "e:plan->adr",
        src: "doc:2026-06-13-conf-plan",
        dst: "doc:2026-06-13-conf-adr",
        relation: "mentions",
        tier: "structural",
        confidence: 0.9,
        derivation: "authorizes",
      },
      {
        id: "e:plan->feature",
        src: "doc:2026-06-13-conf-plan",
        dst: "feature:conf-feature",
        relation: "declares",
        tier: "declared",
        confidence: 1,
        derivation: null,
      },
    ],
    meta_edges: [],
    tiers: TIERS,
  };

  it("preserves authority_class and the aggregate hint on document nodes", () => {
    const slice = adaptGraphSlice(liveOntologySlice);
    const plan = slice.nodes.find((n) => n.id === "doc:2026-06-13-conf-plan");
    const exec = slice.nodes.find((n) => n.id === "doc:2026-06-13-conf-exec-S01");
    expect(plan?.authority_class).toBe("roadmap");
    expect(plan?.aggregate).toBe(false);
    // The exec record is the collapsible aggregate species.
    expect(exec?.authority_class).toBe("evidence");
    expect(exec?.aggregate).toBe(true);
  });

  it("preserves the derivation label alongside the relation on edges", () => {
    const slice = adaptGraphSlice(liveOntologySlice);
    const pipeline = slice.edges.find((e) => e.id === "e:plan->adr");
    // The §4 relation is untouched; the derivation rides alongside it.
    expect(pipeline?.relation).toBe("mentions");
    expect(pipeline?.derivation).toBe("authorizes");
    // A feature-membership edge carries an explicit null derivation, not absent.
    const membership = slice.edges.find((e) => e.id === "e:plan->feature");
    expect(membership?.derivation).toBeNull();
  });
});

describe("adaptGraphSlice salience conformance (live sample, graph-node-salience W04.P10.S43)", () => {
  // A sample CAPTURED from the live `vaultspec serve` `/graph/query` document
  // response under the graph-node-salience wire amendment: the `{data, tiers}`
  // envelope carrying the single active-lens `salience` float on each document
  // node, the active `lens` echo, `salience_partial`, and the bounded-query
  // metadata. Feeding it through the SAME client path the app uses
  // (unwrapEnvelope -> adaptGraphSlice) and asserting salience fidelity is the
  // mock-mirrors-live-wire-shape verification for the salience field.
  const liveSalienceEnvelope = {
    data: {
      nodes: [
        // The live wire serves document nodes ORDERED by descending salience for
        // the active lens (status default), each carrying a single salience float.
        {
          id: "doc:2026-06-14-x-plan",
          kind: "document",
          doc_type: "plan",
          feature_tags: ["x"],
          salience: 0.91,
          degree_by_tier: { declared: 1, structural: 2, temporal: 0, semantic: 0 },
        },
        {
          id: "doc:2026-06-14-x-adr",
          kind: "document",
          doc_type: "adr",
          feature_tags: ["x"],
          salience: 0.54,
          degree_by_tier: { declared: 1, structural: 1, temporal: 0, semantic: 0 },
        },
      ],
      edges: [],
      meta_edges: [],
      filter: {},
      as_of: null,
      last_seq: 12,
      truncated: null,
      lens: "status",
      salience_partial: false,
    },
    tiers: TIERS,
  };

  it("preserves the active-lens salience float through the live client path", () => {
    const slice = adaptGraphSlice(unwrapEnvelope(liveSalienceEnvelope));
    // The active lens defaults to status on the live wire, surfaced verbatim.
    expect(slice.lens).toBe("status");
    expect(slice.salience_partial).toBe(false);
    // Each document node carries its single active-lens salience float, fidelity
    // preserved (not dropped, not re-derived).
    expect(slice.nodes).toHaveLength(2);
    expect(slice.nodes[0].salience).toBe(0.91);
    expect(slice.nodes[1].salience).toBe(0.54);
    // The wire order (descending salience) is preserved: the top-DOI node leads.
    expect(slice.nodes[0].id).toBe("doc:2026-06-14-x-plan");
    expect((slice.nodes[0].salience ?? 0) > (slice.nodes[1].salience ?? 0)).toBe(true);
    // The tiers block rides through for the degradation read.
    expect(slice.tiers.semantic.available).toBe(false);
  });

  it("surfaces salience_partial when the live sample flags a degraded ranking", () => {
    const partialEnvelope = {
      data: {
        ...liveSalienceEnvelope.data,
        lens: "design",
        salience_partial: true,
      },
      tiers: {
        ...TIERS,
        declared: { available: false, reason: "core graph unavailable" },
      },
    };
    const slice = adaptGraphSlice(unwrapEnvelope(partialEnvelope));
    expect(slice.lens).toBe("design");
    expect(slice.salience_partial).toBe(true);
    expect(slice.tiers.declared.available).toBe(false);
  });
});

describe("adaptSearch (live nested rag envelope, W02.P16.S32)", () => {
  it("unwraps the live nested rag envelope and preserves the engine node-id annotation", () => {
    // The live `/search` forwards rag's envelope verbatim
    // (`{envelope: {ok, data: {results}}}`) plus the engine's §8 node-id
    // annotation; adaptSearch must reach into that nesting, not the flat shape.
    const adapted = adaptSearch({
      envelope: {
        ok: true,
        data: {
          results: [
            {
              source: "2026-06-12-auth-flow-adr",
              score: 0.91,
              excerpt: "auth flow decisions",
              node_id: "doc:2026-06-12-auth-flow-adr",
            },
          ],
        },
      },
      tiers: TIERS,
    }) as { results: SearchResult[]; tiers: typeof TIERS };
    expect(adapted.results).toHaveLength(1);
    expect(adapted.results[0].node_id).toBe("doc:2026-06-12-auth-flow-adr");
    expect(adapted.results[0].score).toBe(0.91);
    // The tiers block rides through (semantic degraded in this sample).
    expect(adapted.tiers.semantic.available).toBe(false);
  });

  it("passes a flat (mock/internal) body through unchanged — the one-code-path property", () => {
    const body = { results: [], tiers: TIERS };
    expect(adaptSearch(body)).toBe(body);
  });

  it("tolerates the rag item vocabulary (path/stem/text) when fields are sparse", () => {
    const adapted = adaptSearch({
      envelope: {
        data: {
          results: [{ path: "src/lib/auth.rs", score: 0.7, text: "fn authenticate" }],
        },
      },
      tiers: TIERS,
    }) as { results: SearchResult[] };
    expect(adapted.results[0].source).toBe("src/lib/auth.rs");
    expect(adapted.results[0].excerpt).toBe("fn authenticate");
  });
});

describe("deriveSearchNodeId (node-id grammar, null floor — search ADR)", () => {
  it("the engine annotation always wins", () => {
    expect(deriveSearchNodeId({ node_id: "doc:explicit", path: "x.md" })).toBe(
      "doc:explicit",
    );
  });

  it("derives doc:{stem} for a vault hit when the annotation is absent", () => {
    expect(deriveSearchNodeId({ path: ".vault/adr/2026-06-12-auth-flow-adr.md" })).toBe(
      "doc:2026-06-12-auth-flow-adr",
    );
    expect(deriveSearchNodeId({ stem: "2026-06-12-auth-flow-adr" })).toBe(
      "doc:2026-06-12-auth-flow-adr",
    );
  });

  it("derives code:{path} for a code hit — NEVER papers a code hit as doc:", () => {
    // A non-.md path is a code hit; papering it as doc: would lose the directory
    // and point at no graph node (search ADR risk: phantom click-through).
    expect(deriveSearchNodeId({ path: "src/lib/auth.rs" })).toBe(
      "code:src/lib/auth.rs",
    );
    expect(deriveSearchNodeId({ source: "code", path: "engine/query.rs" })).toBe(
      "code:engine/query.rs",
    );
  });

  it("yields null when no honest id can be formed (never a guess)", () => {
    expect(deriveSearchNodeId({ score: 0.5 })).toBeNull();
    expect(deriveSearchNodeId({ source: "code" })).toBeNull();
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
