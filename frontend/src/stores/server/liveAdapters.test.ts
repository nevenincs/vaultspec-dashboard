// Adapter tests against samples CAPTURED from the live serve origin
// (vaultspec serve, 2026-06-13) — the S49 contract-shape verification in
// executable form. Tolerance is tested too: internal-shape (mock) bodies
// pass through unchanged.

import { describe, expect, it } from "vitest";

import { EngineClient } from "./engine";
import type { EngineNode, SearchResult } from "./engine";
import {
  adaptFilters,
  adaptGitOp,
  adaptGraphEmbeddings,
  adaptGraphSlice,
  adaptHistory,
  adaptLineageSlice,
  adaptMap,
  adaptPipeline,
  adaptPlanInterior,
  adaptSearch,
  adaptStatus,
  adaptVaultTree,
  deriveSearchNodeId,
  docTypeFromStem,
  embeddingsByNodeId,
  mergeNumstat,
  metaEdgeToEdge,
  parseGitNumstat,
  parseGitStatus,
  parseUnifiedDiff,
  unwrapEnvelope,
} from "./liveAdapters";
import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
import { engineNodeToScene } from "../../scene/sceneMapping";
import {
  SEMANTIC_GATE_DATA_PRESENCE_MIN,
  runSemanticGateOnRealData,
} from "../../scene/field/semanticGate";

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

  it("maps the live date_bounds {min, max} onto the internal {from, to}", () => {
    // The live engine serves the corpus span as `{min, max}` (inclusive ISO);
    // the timeline's fit-all / fit-feature / minimap consume `{from, to}`. The
    // adapter reconciles the field names so the corpus-span controls work against
    // the live origin, not only the mock (mock-mirrors-live-wire-shape).
    const adapted = adaptFilters({
      vocabulary: {
        relations: ["mentions"],
        tiers: ["declared", "structural", "temporal", "semantic"],
        date_bounds: { min: "2026-06-10", max: "2026-06-14" },
      },
      tiers: TIERS,
    });
    expect(adapted.date_bounds).toEqual({ from: "2026-06-10", to: "2026-06-14" });
  });

  it("omits date_bounds when the live vocabulary carries none", () => {
    // The live field is skipped when no node has a created date; the adapter must
    // leave it undefined (the fit controls then disable) rather than fabricate a span.
    const adapted = adaptFilters({
      vocabulary: { relations: [], tiers: [] },
      tiers: TIERS,
    });
    expect(adapted.date_bounds).toBeUndefined();
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

describe("adaptLineageSlice (live lineage sample, dashboard-timeline W02.P03.S21)", () => {
  // Captured from the live `/graph/lineage` wire shape (engine `lineage.rs` →
  // `graph_lineage` route, unwrapped from `{data: {nodes, arcs, truncated},
  // tiers}`): dated document nodes in range with their derived phase lane, the
  // self-consistent arcs among them (derivation-fallback: NO `derivation` field
  // until the node-semantics field ships), and a null truncated block under the
  // ceiling. `dates.modified` is the engine `Timestamp` (epoch-ms NUMBER).
  const liveLineage = {
    nodes: [
      {
        id: "doc:2026-06-10-x-research",
        doc_type: "research",
        phase: "research",
        dates: { created: "2026-06-10", modified: 1718000000000 },
        title: "x research",
        degree: 3,
      },
      {
        id: "doc:2026-06-12-x-adr",
        doc_type: "adr",
        phase: "adr",
        // An undated-modified, untitled node: both optionals absent on the wire.
        dates: { created: "2026-06-12" },
        degree: 2,
      },
    ],
    arcs: [
      {
        id: "edge:abc",
        src: "doc:2026-06-12-x-adr",
        dst: "doc:2026-06-10-x-research",
        relation: "mentions",
        // derivation-fallback: the field is ABSENT on the wire (engine `Edge`
        // carries no `derivation` yet); the arc is real structural lineage.
        tier: "structural",
        confidence: 0.9,
      },
    ],
    truncated: null,
    tiers: TIERS,
  };

  it("reconciles the lineage slice: nodes, arcs, tiers, and the optional fields", () => {
    const slice = adaptLineageSlice(liveLineage);
    expect(slice.nodes).toHaveLength(2);
    // The research node carries its title and the numeric epoch-ms modified tick.
    const research = slice.nodes[0];
    expect(research.id).toBe("doc:2026-06-10-x-research");
    expect(research.phase).toBe("research");
    expect(research.dates.created).toBe("2026-06-10");
    expect(research.dates.modified).toBe(1718000000000);
    expect(research.title).toBe("x research");
    expect(research.degree).toBe(3);
    // The ADR node tolerates both optionals absent (no title, no modified tick).
    const adr = slice.nodes[1];
    expect(adr.title).toBeUndefined();
    expect(adr.dates.modified).toBeUndefined();
    expect(adr.dates.created).toBe("2026-06-12");
    // The arc is real structural lineage with NO derivation (graceful fallback).
    expect(slice.arcs).toHaveLength(1);
    const arc = slice.arcs[0];
    expect(arc.relation).toBe("mentions");
    expect(arc.tier).toBe("structural");
    expect(arc.derivation).toBeUndefined();
    // Self-consistency: the arc's endpoints are both returned nodes.
    const ids = new Set(slice.nodes.map((n) => n.id));
    expect(ids.has(arc.src) && ids.has(arc.dst)).toBe(true);
    // The tiers block rides through (semantic present-only/degraded in range).
    expect(slice.tiers.semantic.available).toBe(false);
    // Under the ceiling: no truncation block.
    expect(slice.truncated).toBeNull();
  });

  it("carries the truncated honesty block when the engine capped the slice", () => {
    const capped = adaptLineageSlice({
      nodes: [],
      arcs: [],
      truncated: {
        total_nodes: 6000,
        returned_nodes: 5000,
        reason: "lineage document node ceiling",
      },
      tiers: TIERS,
    });
    expect(capped.truncated).toEqual({
      total_nodes: 6000,
      returned_nodes: 5000,
      reason: "lineage document node ceiling",
    });
  });

  it("tolerates a sparse body: absent arrays default to empty, never throws", () => {
    const sparse = adaptLineageSlice({ tiers: TIERS });
    expect(sparse.nodes).toEqual([]);
    expect(sparse.arcs).toEqual([]);
    expect(sparse.truncated).toBeNull();
    expect(sparse.tiers.declared.available).toBe(true);
    // A non-object body degrades to safe empties rather than crashing the load.
    expect(adaptLineageSlice(null)).toEqual({
      nodes: [],
      arcs: [],
      tiers: {},
      truncated: null,
    });
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

// --- dashboard-pipeline-wire W05.P12: consumer fidelity ----------------------------
//
// Each test feeds a sample CAPTURED from the live serve wire shape (the
// `{data, tiers}` envelope the routes serve) through the SAME client path the app
// uses (unwrapEnvelope + the adapter), then drives the MockEngine through that same
// EngineClient and asserts the two shapes match — the mock-mirrors-live-wire-shape
// verification in executable form. A divergence is a test-fidelity defect to fix
// in the mock, never papered over by adapting only the live side.

function clientOn(mock: MockEngine): EngineClient {
  const client = new EngineClient({ baseUrl: "" });
  client.useTransport(mock.fetchImpl);
  return client;
}

describe("adaptPipeline + /pipeline consumer fidelity (W05.P12.S62)", () => {
  // A live `/pipeline` envelope: an active L3 plan (work started → execute) and a
  // proposed ADR (adr phase). The live route serves `{data: {artifacts}, tiers}`.
  const live = {
    data: {
      artifacts: [
        {
          node_id: "doc:2026-06-14-x-adr",
          stem: "2026-06-14-x-adr",
          title: "x adr",
          doc_type: "adr",
          status: "proposed",
          phase: "adr",
        },
        {
          node_id: "doc:2026-06-14-x-plan",
          stem: "2026-06-14-x-plan",
          title: "x plan",
          doc_type: "plan",
          tier: "L3",
          progress: { done: 2, total: 5 },
          phase: "execute",
        },
      ],
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live pipeline envelope", () => {
    const adapted = adaptPipeline(unwrapEnvelope(live));
    expect(adapted.artifacts).toHaveLength(2);
    expect(adapted.artifacts[0]).toMatchObject({
      node_id: "doc:2026-06-14-x-adr",
      status: "proposed",
      phase: "adr",
    });
    expect(adapted.artifacts[1]).toMatchObject({
      tier: "L3",
      phase: "execute",
      progress: { done: 2, total: 5 },
    });
    expect(adapted.tiers.semantic.available).toBe(false);
  });

  it("the mock serves the same pipeline shape through the client path", async () => {
    const mock = new MockEngine();
    const result = await clientOn(mock).pipeline(MOCK_SCOPE);
    // The mock excludes complete plans and rejected/deprecated ADRs, includes
    // active plans + proposed/accepted ADRs — same projection as the live engine.
    expect(result.artifacts.length).toBeGreaterThan(0);
    for (const a of result.artifacts) {
      if (a.doc_type === "adr") {
        expect(["proposed", "accepted"]).toContain(a.status);
        expect(a.phase).toBe("adr");
        expect(a.progress).toBeUndefined();
      } else {
        expect(a.doc_type).toBe("plan");
        expect(["plan", "execute"]).toContain(a.phase);
        // An active plan carries progress + tier, never a status.
        expect(a.status).toBeUndefined();
      }
    }
    // Sorted by node id (deterministic ordering), same as the live projection.
    const ids = result.artifacts.map((a) => a.node_id);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("adaptPlanInterior + plan-interior consumer fidelity (W05.P12.S63)", () => {
  // A live `/nodes/{id}/plan-interior` envelope: an L3 interior (one wave, one
  // phase, two steps) with a truncated block. The route wraps under `interior`.
  const live = {
    data: {
      interior: {
        plan_node_id: "doc:2026-06-14-x-plan",
        waves: [
          {
            node_id: "plan:2026-06-14-x-plan/W01",
            id: "W01",
            heading: "the wave",
            phases: [
              {
                node_id: "plan:2026-06-14-x-plan/W01/P01",
                id: "P01",
                heading: "the phase",
                steps: [
                  {
                    node_id: "plan:2026-06-14-x-plan/W01/P01/S01",
                    id: "S01",
                    action: "did it",
                    done: true,
                    exec_node_id: "doc:2026-06-14-x-W01-P01-S01",
                  },
                  {
                    node_id: "plan:2026-06-14-x-plan/W01/P01/S02",
                    id: "S02",
                    action: "todo",
                    done: false,
                  },
                ],
              },
            ],
          },
        ],
        phases: [],
        steps: [],
        truncated: {
          total_nodes: 9001,
          returned_nodes: 2000,
          reason: "plan interior node ceiling",
        },
      },
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live plan-interior envelope, folding the truncated block", () => {
    const adapted = adaptPlanInterior(unwrapEnvelope(live));
    expect(adapted.interior.plan_node_id).toBe("doc:2026-06-14-x-plan");
    expect(adapted.interior.waves).toHaveLength(1);
    const steps = adapted.interior.waves[0].phases[0].steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      id: "S01",
      done: true,
      exec_node_id: "doc:2026-06-14-x-W01-P01-S01",
    });
    expect(steps[1].done).toBe(false);
    expect(adapted.interior.truncated).toEqual({
      total_nodes: 9001,
      returned_nodes: 2000,
      reason: "plan interior node ceiling",
    });
  });

  it("the mock serves the same plan-interior shape through the client path", async () => {
    const mock = new MockEngine();
    // Find a plan node id from the corpus.
    const planNode = mock.corpus.nodes.find((n) => n.doc_type === "plan");
    expect(planNode).toBeDefined();
    const result = await clientOn(mock).planInterior(planNode!.id);
    expect(result.interior.plan_node_id).toBe(planNode!.id);
    // The interior carries steps with the completion + canonical id shape, at
    // whatever depth the plan's tier declares (flat L1, phases L2, waves L3/L4).
    const allSteps = [
      ...result.interior.steps,
      ...result.interior.phases.flatMap((p) => p.steps),
      ...result.interior.waves.flatMap((w) => w.phases.flatMap((p) => p.steps)),
    ];
    expect(allSteps.length).toBeGreaterThan(0);
    for (const s of allSteps) {
      expect(typeof s.id).toBe("string");
      expect(s.id).toMatch(/^S\d+$/);
      expect(typeof s.done).toBe("boolean");
    }
    expect(result.interior.truncated).toBeNull();

    // A non-plan node has no interior — the client throws a tiered 404, exactly
    // like the live route's truthful-None path.
    const codeNode = mock.corpus.nodes.find((n) => n.kind === "code");
    await expect(clientOn(mock).planInterior(codeNode!.id)).rejects.toThrow();
  });
});

describe("adaptGitOp + /ops/git consumer fidelity (W05.P12.S64)", () => {
  // Live `/ops/git/{verb}` envelopes: git output forwarded verbatim under
  // `{data: {verb, output}, tiers}`.
  const liveStatus = {
    data: {
      verb: "status",
      output: "## main\n M .vault/plan/2026-01-05-editor-demo-plan.md\n",
    },
    tiers: TIERS,
  };
  const liveDiff = {
    data: {
      verb: "diff",
      output:
        "diff --git a/x.md b/x.md\n--- a/x.md\n+++ b/x.md\n@@ -1,1 +1,1 @@\n-old\n+new\n",
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live git status + diff envelopes verbatim", () => {
    const status = adaptGitOp(unwrapEnvelope(liveStatus));
    expect(status.verb).toBe("status");
    // Porcelain per-file `XY path` line forwarded verbatim.
    expect(status.output).toContain(" M .vault/plan/");
    const diff = adaptGitOp(unwrapEnvelope(liveDiff));
    expect(diff.verb).toBe("diff");
    expect(diff.output).toContain("@@ -1,1 +1,1 @@");
    expect(diff.output).toContain("+new");
  });

  it("the mock serves the same git status + diff shapes through the client path", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(true);
    const client = clientOn(mock);

    const status = await client.opsGit("status");
    expect(status.verb).toBe("status");
    // The mock emits the same porcelain per-file `XY path` shape the live engine
    // forwards (a branch header line, then per-file status).
    expect(status.output).toMatch(/^## main\n/);
    expect(status.output).toMatch(/ M .+\.md\n/);

    const numstat = await client.opsGit("numstat");
    expect(numstat.output).toMatch(/^\d+\t\d+\t.+\.md\n/);

    const diff = await client.opsGit("diff", { path: ".vault/plan/x.md" });
    expect(diff.verb).toBe("diff");
    expect(diff.output).toContain("@@ ");
    expect(diff.output).toContain("+new line");

    // A non-whitelisted verb is a tiered 403 (read-only whitelist), and diff
    // without a path is a 400 — same as the live route.
    await expect(client.opsGit("commit" as "status")).rejects.toThrow();
    await expect(client.opsGit("diff")).rejects.toThrow();
  });
});

describe("git output parsers (git-diff-browser W06.P19.S72)", () => {
  it("parses porcelain-v1 status into status-grouped changed-file entries", () => {
    // A porcelain-v1 sample exercising each XY status: branch header (skipped),
    // a worktree modify, a staged add, a worktree delete, a rename, untracked.
    const output =
      "## main...origin/main [ahead 1]\n" +
      " M src/a.ts\n" +
      "A  src/new.ts\n" +
      " D src/gone.ts\n" +
      "R  src/old.ts -> src/renamed.ts\n" +
      "?? .vault/scratch.md\n";
    const files = parseGitStatus(output);
    expect(files.map((f) => [f.path, f.group, f.letter])).toEqual([
      ["src/a.ts", "modified", "M"],
      ["src/new.ts", "staged", "A"],
      ["src/gone.ts", "deleted", "D"],
      ["src/renamed.ts", "renamed", "R"], // rename tracks the NEW path
      [".vault/scratch.md", "untracked", "?"],
    ]);
    // The vault corpus entry carries the vault flag; the others do not.
    expect(files.find((f) => f.path === ".vault/scratch.md")!.vault).toBe(true);
    expect(files.find((f) => f.path === "src/a.ts")!.vault).toBe(false);
  });

  it("parses numstat tallies and reconciles them onto status entries (binary → null)", () => {
    const numstat = "3\t1\tsrc/a.ts\n-\t-\timg/logo.png\n";
    const tallies = parseGitNumstat(numstat);
    expect(tallies.get("src/a.ts")).toEqual({ adds: 3, dels: 1 });
    expect(tallies.get("img/logo.png")).toEqual({ adds: null, dels: null });
    const merged = mergeNumstat(parseGitStatus("## main\n M src/a.ts\n"), tallies);
    expect(merged[0]).toMatchObject({ path: "src/a.ts", adds: 3, dels: 1 });
  });

  it("parses a unified diff into hunks with twin line numbers and per-line kinds", () => {
    const diff =
      "diff --git a/x.md b/x.md\n" +
      "index 1111111..2222222 100644\n" +
      "--- a/x.md\n+++ b/x.md\n" +
      "@@ -1,3 +1,3 @@\n" +
      " context line\n-old line\n+new line\n";
    const parsed = parseUnifiedDiff(diff, "x.md", "M");
    expect(parsed.path).toBe("x.md");
    expect(parsed.status).toBe("M");
    expect(parsed.binary).toBe(false);
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].header).toBe("@@ -1,3 +1,3 @@");
    // Twin gutters advance correctly: context on both sides at line 1, the
    // removed line on the old side (2), the added line on the new side (2).
    expect(parsed.hunks[0].lines).toEqual([
      { kind: "context", old: 1, new: 1, text: "context line" },
      { kind: "remove", old: 2, new: null, text: "old line" },
      { kind: "add", old: null, new: 2, text: "new line" },
    ]);
  });

  it("reports a binary file as binary with no hunks", () => {
    const diff =
      "diff --git a/logo.png b/logo.png\n" +
      "Binary files a/logo.png and b/logo.png differ\n";
    const parsed = parseUnifiedDiff(diff, "logo.png");
    expect(parsed.binary).toBe(true);
    expect(parsed.hunks).toHaveLength(0);
  });
});

describe("status + tier facets carried identically by mock and live (W05.P12.S65)", () => {
  // A live `/vault-tree` sample carrying status/tier on its ADR and plan entries
  // — the stem-keyed live shape the adapter maps, now with the new facets.
  const liveTree = {
    data: {
      entries: [
        {
          stem: "2026-06-14-x-adr",
          node_id: "doc:2026-06-14-x-adr",
          feature_tags: ["x"],
          status: "accepted",
        },
        {
          stem: "2026-06-14-x-plan",
          node_id: "doc:2026-06-14-x-plan",
          feature_tags: ["x"],
          tier: "L3",
          progress: { done: 2, total: 5 },
        },
      ],
    },
    tiers: TIERS,
  };

  it("the live vault-tree carries status on its ADR and tier + progress on its plan", () => {
    const adapted = adaptVaultTree(unwrapEnvelope(liveTree));
    const adr = adapted.entries.find((e) => e.doc_type === "adr");
    const plan = adapted.entries.find((e) => e.doc_type === "plan");
    expect(adr?.status).toBe("accepted");
    expect(plan?.tier).toBe("L3");
    // The plan's checkbox progress rides through so the rail's status pip lights
    // up from real lifecycle truth (planStatus => in-progress here).
    expect(plan?.progress).toEqual({ done: 2, total: 5 });
    // An ADR carries no checkbox progress (truthful absence).
    expect(adr?.progress).toBeUndefined();
  });

  it("ignores a malformed progress pair (tolerant adapter, honest absence)", () => {
    const adapted = adaptVaultTree(
      unwrapEnvelope({
        data: {
          entries: [
            {
              stem: "2026-06-14-y-plan",
              node_id: "doc:2026-06-14-y-plan",
              feature_tags: ["y"],
              tier: "L1",
              progress: { done: "2", total: null },
            },
          ],
        },
        tiers: TIERS,
      }),
    );
    const plan = adapted.entries.find((e) => e.doc_type === "plan");
    expect(plan?.progress).toBeUndefined();
  });

  it("the mock vault-tree and graph-query nodes carry status and tier identically", async () => {
    const mock = new MockEngine();
    const client = clientOn(mock);

    // vault-tree: ADR entries carry status, plan entries carry tier + progress.
    const tree = await client.vaultTree(MOCK_SCOPE);
    const adrEntry = tree.entries.find((e) => e.doc_type === "adr");
    const planEntry = tree.entries.find((e) => e.doc_type === "plan");
    expect(adrEntry?.status).toBeDefined();
    expect(["proposed", "accepted", "rejected", "deprecated"]).toContain(
      adrEntry?.status,
    );
    expect(planEntry?.tier).toBeDefined();
    expect(["L1", "L2", "L3", "L4"]).toContain(planEntry?.tier);
    // Every plan row carries a well-formed checkbox progress pair, and the
    // corpus spreads them across ALL THREE design states (✓ complete / ◐
    // in-progress / ○ not-started) so the rail's status pip is exercised end to
    // end against the mock that mirrors the new live shape.
    const planEntries = tree.entries.filter((e) => e.doc_type === "plan");
    expect(planEntries.length).toBeGreaterThan(0);
    for (const p of planEntries) {
      expect(typeof p.progress?.done).toBe("number");
      expect(typeof p.progress?.total).toBe("number");
    }
    const planState = (p?: { done: number; total: number }) =>
      !p || p.total <= 0
        ? "not-started"
        : p.done >= p.total
          ? "complete"
          : p.done > 0
            ? "in-progress"
            : "not-started";
    const statuses = new Set(planEntries.map((p) => planState(p.progress)));
    expect(statuses).toEqual(new Set(["complete", "in-progress", "not-started"]));
    // A non-ADR/non-plan entry carries no plan facets (truthful absence).
    const research = tree.entries.find((e) => e.doc_type === "research");
    expect(research?.status).toBeUndefined();
    expect(research?.tier).toBeUndefined();
    expect(research?.progress).toBeUndefined();

    // graph-query: the same facets ride on the doc nodes.
    const slice = await client.graphQuery({ scope: MOCK_SCOPE });
    const adrNode = slice.nodes.find((n) => n.doc_type === "adr");
    const planNode = slice.nodes.find((n) => n.doc_type === "plan");
    expect(adrNode?.status).toBeDefined();
    expect(planNode?.tier).toBeDefined();
  });
});

describe("enriched node-evidence consumer fidelity (figma-parity-reconciliation S18)", () => {
  // A sample CAPTURED from the live `/nodes/{id}/evidence` wire under the S13
  // enrichment: the `{data, tiers}` envelope carrying the GUI `NodeEvidence`
  // shape — documents as `{ path, doc_type }`, code_locations keyed on `path`
  // (with the optional `symbol` and the additive `resolved_target`/
  // `bridge_node_id` value-adds), and commits carrying the `subject`. Feeding it
  // through the SAME client path the app uses (unwrapEnvelope) and then driving
  // the mock through the EngineClient is the mock-mirrors-live-wire-shape
  // verification for the enriched evidence shape.
  const liveEvidence = {
    data: {
      documents: [
        { path: ".vault/adr/2026-06-14-x-adr.md", doc_type: "adr" },
        { path: ".vault/plan/2026-06-14-x-plan.md", doc_type: "plan" },
      ],
      code_locations: [
        {
          path: "src/x/mod.rs",
          state: "resolved",
          resolved_target: "src/x/mod.rs",
          bridge_node_id: "code:src/x/mod.rs",
        },
        {
          path: "src/x/mod.rs",
          symbol: "handle",
          state: "resolved",
          resolved_target: "src/x/mod.rs#handle",
          bridge_node_id: "code:src/x/mod.rs",
        },
      ],
      commits: [
        {
          sha: "abc1234",
          subject: "feat: the enriched commit",
          rule: "step-id-correlation",
          // The live `CorrelatedCommit` always serializes `confidence: f32` (the
          // correlating edge's confidence); the captured sample carries it so the
          // sample matches the live wire byte-for-byte (review LOW-1).
          confidence: 0.7,
        },
      ],
    },
    tiers: TIERS,
  };

  it("unwraps the live enriched evidence envelope onto the GUI NodeEvidence shape", () => {
    const ev = unwrapEnvelope(liveEvidence) as {
      documents: { path: string; doc_type: string }[];
      code_locations: { path: string; symbol?: string; state: string }[];
      commits: { sha: string; subject: string; rule?: string }[];
      tiers: typeof TIERS;
    };
    // Documents carry path + doc_type (not bare stems).
    expect(ev.documents[0]).toEqual({
      path: ".vault/adr/2026-06-14-x-adr.md",
      doc_type: "adr",
    });
    // Code locations are keyed on `path` (the corrected field name), and the
    // symbol mention surfaces its unqualified symbol.
    expect(ev.code_locations[0].path).toBe("src/x/mod.rs");
    expect(ev.code_locations[1].symbol).toBe("handle");
    // Commits carry the subject (the previously-missing git lookup datum).
    expect(ev.commits[0].subject).toBe("feat: the enriched commit");
    expect(ev.tiers.semantic.available).toBe(false);
  });

  it("the mock serves the same enriched evidence shape through the client path", async () => {
    const mock = new MockEngine();
    const client = clientOn(mock);
    // A node with a feature tag so the mock evidence projection populates.
    const node = mock.corpus.nodes.find((n) => (n.feature_tags?.length ?? 0) > 0);
    expect(node).toBeDefined();
    const ev = (await client.nodeEvidence(node!.id)) as unknown as {
      documents: { path: string; doc_type: string }[];
      code_locations: { path: string; symbol?: string; state: string }[];
      commits: { sha: string; subject: string; rule?: string }[];
    };
    // Documents: every item carries a vault path and a doc_type, never a bare stem.
    expect(ev.documents.length).toBeGreaterThan(0);
    for (const d of ev.documents) {
      expect(typeof d.path).toBe("string");
      expect(d.path.startsWith(".vault/")).toBe(true);
      expect(typeof d.doc_type).toBe("string");
    }
    // Code locations are keyed on `path` (never the legacy `target`), and the
    // mock exercises the optional `symbol` field the GUI consumes.
    expect(ev.code_locations.length).toBeGreaterThan(0);
    for (const loc of ev.code_locations) {
      expect(typeof loc.path).toBe("string");
      expect((loc as Record<string, unknown>).target).toBeUndefined();
    }
    expect(ev.code_locations.some((loc) => loc.symbol === "handle")).toBe(true);
    // Commits carry the subject.
    expect(ev.commits.length).toBeGreaterThan(0);
    for (const c of ev.commits) {
      expect(typeof c.subject).toBe("string");
      expect(c.subject.length).toBeGreaterThan(0);
    }
  });
});

describe("historical text-diff consumer fidelity (figma-parity-reconciliation S18)", () => {
  // A sample CAPTURED from the live `/ops/git/histdiff` wire: a two-rev unified
  // diff forwarded VERBATIM inside `{data: {verb, output}, tiers}`. Fed through
  // the SAME client path the app uses (unwrapEnvelope + adaptGitOp), then the
  // mock is driven through the EngineClient and the two shapes are asserted to
  // match — the mock-mirrors-live-wire-shape verification for the historical
  // diff route.
  const liveHistDiff = {
    data: {
      verb: "histdiff",
      output:
        "diff --git a/.vault/plan/x.md b/.vault/plan/x.md\n" +
        "index 1111111..3333333 100644\n" +
        "--- a/.vault/plan/x.md\n+++ b/.vault/plan/x.md\n" +
        "@@ -1,1 +1,1 @@\n" +
        "-original line\n+rewritten line\n",
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live historical-diff envelope verbatim", () => {
    const diff = adaptGitOp(unwrapEnvelope(liveHistDiff));
    expect(diff.verb).toBe("histdiff");
    // The two-rev unified diff is forwarded verbatim; both edits are present.
    expect(diff.output).toContain("@@ -1,1 +1,1 @@");
    expect(diff.output).toContain("-original line");
    expect(diff.output).toContain("+rewritten line");
    expect(diff.tiers.semantic.available).toBe(false);
  });

  it("the mock serves the same historical-diff shape through the client path", async () => {
    const mock = new MockEngine();
    const client = clientOn(mock);
    const diff = await client.opsGit("histdiff", {
      path: ".vault/plan/x.md",
      from: "HEAD~1",
      to: "HEAD",
    });
    expect(diff.verb).toBe("histdiff");
    expect(diff.output).toContain("@@ ");
    expect(diff.output).toContain("-original line");
    expect(diff.output).toContain("+rewritten line");

    // The same validation the live route enforces: a histdiff missing a rev is a
    // 400, and a non-whitelisted verb is a 403 — before any work, exactly as live.
    await expect(
      client.opsGit("histdiff", { path: ".vault/plan/x.md", from: "HEAD~1" }),
    ).rejects.toThrow();
    await expect(client.opsGit("commit" as "histdiff")).rejects.toThrow();
  });
});

describe("adaptHistory (status-overview /history)", () => {
  it("adapts a live-shaped /history body, defaulting short_hash and dropping bad rows", () => {
    // A captured live-shape body: snake_case commit rows + tiers block, exactly
    // as `vaultspec-api` history.rs serves under the {data, tiers} envelope.
    const live = {
      commits: [
        {
          hash: "0123456789abcdef0123456789abcdef01234567",
          short_hash: "01234567",
          subject: "feat: the latest commit",
          ts: 1_700_000_002_000,
          node_ids: ["commit:0123456789abcdef0123456789abcdef01234567", "doc:x-plan"],
        },
        // A row missing short_hash: the adapter derives it from the hash.
        {
          hash: "abcdef0123456789abcdef0123456789abcdef01",
          subject: "fix: an older commit",
          ts: 1_700_000_001_000,
          node_ids: ["commit:abcdef0123456789abcdef0123456789abcdef01"],
        },
        // A malformed row (no hash): dropped, never crashing the list.
        { subject: "no hash here", ts: 1 },
      ],
      truncated: null,
      tiers: TIERS,
    };
    const res = adaptHistory(live);
    expect(res.commits).toHaveLength(2);
    expect(res.commits[0].subject).toBe("feat: the latest commit");
    // The sparse row's short_hash is derived from the full hash.
    expect(res.commits[1].short_hash).toBe("abcdef01");
    expect(res.commits[1].node_ids).toEqual([
      "commit:abcdef0123456789abcdef0123456789abcdef01",
    ]);
    expect(res.tiers).toBe(TIERS);
  });

  it("tolerates an absent body with an empty list + empty tiers (degraded read)", () => {
    const res = adaptHistory(undefined);
    expect(res.commits).toEqual([]);
    expect(res.truncated).toBeNull();
    expect(res.tiers).toEqual({});
  });

  it("forwards the truncated clamp block when the engine reports it", () => {
    const res = adaptHistory({
      commits: [],
      truncated: { requested: 5000, returned: 200, reason: "history limit ceiling" },
      tiers: TIERS,
    });
    expect(res.truncated).toEqual({
      requested: 5000,
      returned: 200,
      reason: "history limit ceiling",
    });
  });
});

// graph-semantic-embeddings ADR D6 / W04.P16.S62: a captured-live `/graph/
// embeddings` sample fed through the REAL adaptGraphEmbeddings -> sceneMapping ->
// projection path the app uses (mock-mirrors-live-wire-shape). The gate is the
// honesty check the original synthetic-only gate was missing: it must SHIP on a
// real clustered slice and be HELD on an empty (unserved-embedding) path.

describe("adaptGraphEmbeddings (captured-live sample -> scene projection gate)", () => {
  const DIM = 8;
  /** A deterministic feature-clustered dense vector — the SHAPE rag's stored
   *  vectors take (a per-feature base direction + tiny per-doc jitter), so the
   *  real-data projection separates feature meaning-clusters. */
  function clusterVector(featureIndex: number, docIndex: number): number[] {
    const v: number[] = [];
    for (let d = 0; d < DIM; d++) {
      const center = Math.sin((featureIndex + 1) * (d + 1) * 0.7);
      const jitter = Math.cos((docIndex + 1) * (d + 1) * 0.3) * 0.08;
      v.push(center + jitter);
    }
    return v;
  }

  /** A CAPTURED live `/graph/embeddings` envelope: the `{data: {embeddings,
   *  generation, truncated, lens}, tiers}` shape the live engine serves, with
   *  `featureCount` clusters × `perFeature` documents of real-shaped vectors. */
  function liveEnvelope(featureCount: number, perFeature: number) {
    const embeddings: { node_id: string; vector: number[] }[] = [];
    const labelOf = new Map<string, number>();
    for (let f = 0; f < featureCount; f++) {
      for (let d = 0; d < perFeature; d++) {
        const id = `doc:f${f}-doc${d}`;
        embeddings.push({ node_id: id, vector: clusterVector(f, d) });
        labelOf.set(id, f);
      }
    }
    const envelope = {
      data: { embeddings, generation: 7, truncated: null, lens: "status" },
      tiers: {
        declared: { available: true },
        structural: { available: true },
        temporal: { available: true },
        semantic: { available: true },
      },
    };
    return { envelope, labelOf };
  }

  it("carries generation/tiers and feeds the projection gate to SHIP on real clusters", () => {
    const { envelope, labelOf } = liveEnvelope(5, 8);
    // The REAL client path: unwrap the live envelope, then adapt.
    const adapted = adaptGraphEmbeddings(unwrapEnvelope(envelope));
    expect(adapted.generation).toBe(7);
    expect(adapted.tiers.semantic.available).toBe(true);
    expect(adapted.embeddings).toHaveLength(40);

    // Merge the adapted vectors onto the served nodes and map through the REAL
    // sceneMapping path the app uses (engineNodeToScene maps `embedding`).
    const byId = new Map(adapted.embeddings.map((e) => [e.node_id, e.vector]));
    const sceneNodes = [...byId.keys()].map((id) => {
      const node: EngineNode = { id, kind: "adr", embedding: byId.get(id) };
      return engineNodeToScene(node);
    });

    // The real-data gate: presence (no empty path) AND separation over the REAL
    // projected vectors. The clustered sample ships.
    const verdict = runSemanticGateOnRealData(sceneNodes, labelOf);
    expect(verdict.presence).toBe(1);
    expect(verdict.shipped).toBe(true);
    expect(verdict.separation).toBeGreaterThan(0);
  });

  it("cannot report shipped on an empty (unserved-embedding) path", () => {
    // The live engine served an EMPTY embedding set (rag down, or no docs in
    // Qdrant yet): every node falls into the fallback ring, so the gate's
    // data-presence floor fails and the mode is HELD — the exact honesty the
    // synthetic-only gate masked (ADR D6).
    const adapted = adaptGraphEmbeddings(
      unwrapEnvelope({
        data: { embeddings: [], generation: 7, truncated: null, lens: "status" },
        tiers: {
          declared: { available: true },
          structural: { available: true },
          temporal: { available: true },
          semantic: { available: false, reason: "rag service down" },
        },
      }),
    );
    expect(adapted.embeddings).toHaveLength(0);
    expect(adapted.tiers.semantic.available).toBe(false);

    // Nodes carry NO embedding (none served): all fallback, presence 0.
    const sceneNodes = ["doc:a", "doc:b", "doc:c"].map((id) =>
      engineNodeToScene({ id, kind: "adr" }),
    );
    const labelOf = new Map([
      ["doc:a", 0],
      ["doc:b", 0],
      ["doc:c", 1],
    ]);
    const verdict = runSemanticGateOnRealData(sceneNodes, labelOf);
    expect(verdict.presence).toBe(0);
    expect(verdict.presence).toBeLessThan(SEMANTIC_GATE_DATA_PRESENCE_MIN);
    expect(verdict.shipped).toBe(false);
    expect(verdict.reason).toMatch(/empty\/fallback path/);
  });

  it("drops a malformed entry and passes mock (internal) bodies through unchanged", () => {
    // A NaN-bearing or node_id-less entry never reaches the projection.
    const adapted = adaptGraphEmbeddings({
      embeddings: [
        { node_id: "doc:ok", vector: [0.1, 0.2] },
        { node_id: "doc:nan", vector: [Number.NaN, 1] },
        { vector: [0.3] },
        { node_id: "doc:empty", vector: [] },
      ],
      generation: 3,
      truncated: null,
      tiers: { semantic: { available: true } },
    });
    // doc:nan keeps its one finite element; the id-less and all-NaN/empty drop.
    expect(adapted.embeddings.map((e) => e.node_id)).toEqual(["doc:ok", "doc:nan"]);
    expect(adapted.embeddings[1].vector).toEqual([1]);
  });

  it("feeds a CAPTURED mock /graph/embeddings sample through the same path", async () => {
    // The mock serves the live-shape `/graph/embeddings` byte-for-byte: drive a
    // real client read through the mock transport and assert the vectors flow.
    const engine = new MockEngine();
    const client = new EngineClient();
    client.useTransport(engine.fetchImpl);
    const res = await client.graphEmbeddings({ scope: MOCK_SCOPE });
    expect(res.generation).toBe(0);
    expect(res.tiers.semantic.available).toBe(true);
    expect(res.embeddings.length).toBeGreaterThan(0);
    // Every served vector keys a real served document node; map through the scene
    // path and confirm the projection runs over the real mock corpus.
    const sceneNodes = res.embeddings.map((e) =>
      engineNodeToScene({ id: e.node_id, kind: "adr", embedding: e.vector }),
    );
    const verdict = runSemanticGateOnRealData(sceneNodes, new Map());
    expect(verdict.presence).toBe(1);
  });
});

// graph-node-representation ADR D1 / W02.P05.S28: the embedding↔node join is
// contractually keyed by `node_id`, NEVER by positional/DOI order. These tests
// feed a captured live-shape `/graph/embeddings` envelope through the REAL client
// path the app uses (unwrapEnvelope -> adaptGraphEmbeddings -> embeddingsByNodeId)
// and prove the vectors land on the correct nodes by id even when the embeddings
// array is REORDERED or a strict SUBSET of the node set, and that a node with no
// served vector is an honest absence (no crash, no mis-assignment).

describe("embeddingsByNodeId (node_id join contract, ADR D1)", () => {
  const DIM = 4;
  /** A distinct, recognizable vector per node so a mis-join is observable: the
   *  vector encodes the node's index in its first slot. */
  function vectorFor(index: number): number[] {
    return [index, index + 0.1, index + 0.2, index + 0.3].slice(0, DIM);
  }

  /** The graph node set the constellation serves — five document nodes in a
   *  FIXED order (the `/graph/query` order). The embeddings array below is keyed
   *  to these ids but deliberately NOT in this order. */
  const nodeIds = ["doc:a", "doc:b", "doc:c", "doc:d", "doc:e"];

  /** A CAPTURED live `/graph/embeddings` envelope whose `embeddings` rows are
   *  (1) REORDERED relative to the node set and (2) a strict SUBSET — `doc:c` and
   *  `doc:e` carry no stored vector (honest absences). The shape is the exact
   *  `{data: {embeddings, generation, truncated, lens}, tiers}` the live engine
   *  serves. */
  const liveEnvelope = {
    data: {
      embeddings: [
        // Reversed/shuffled order, and `doc:c`/`doc:e` omitted entirely.
        { node_id: "doc:d", vector: vectorFor(3) },
        { node_id: "doc:a", vector: vectorFor(0) },
        { node_id: "doc:b", vector: vectorFor(1) },
      ],
      generation: 11,
      truncated: null,
      lens: "status",
    },
    tiers: {
      declared: { available: true },
      structural: { available: true },
      temporal: { available: true },
      semantic: { available: true },
    },
  };

  it("joins each vector to its node BY id regardless of array order", () => {
    // The REAL client path: unwrap the envelope, adapt, build the by-id join.
    const adapted = adaptGraphEmbeddings(unwrapEnvelope(liveEnvelope));
    const byId = embeddingsByNodeId(adapted);

    // Each served vector lands on its OWN node, not the node at its array
    // position. `doc:d` arrived FIRST in the array but joins to `doc:d`, not to
    // `doc:a` (the first node in the node set) — the positional-join bug this
    // contract forbids.
    expect(byId.get("doc:a")).toEqual(vectorFor(0));
    expect(byId.get("doc:b")).toEqual(vectorFor(1));
    expect(byId.get("doc:d")).toEqual(vectorFor(3));
  });

  it("treats a node with no served vector as an honest absence (no mis-assignment)", () => {
    const adapted = adaptGraphEmbeddings(unwrapEnvelope(liveEnvelope));
    const byId = embeddingsByNodeId(adapted);

    // `doc:c` and `doc:e` carry no stored vector: the map simply does not contain
    // them. They are absent, never assigned some other node's vector.
    expect(byId.has("doc:c")).toBe(false);
    expect(byId.has("doc:e")).toBe(false);
    expect(byId.get("doc:c")).toBeUndefined();
    // The join is a strict subset: only the three served nodes are present.
    expect(byId.size).toBe(3);

    // Merging onto the full node set (the scene's `map.get(node.id)` step) leaves
    // the absent nodes embeddingless — they ring the fallback, not mis-joined.
    const merged = nodeIds.map((id) => ({ id, embedding: byId.get(id) }));
    const embeddingless = merged.filter((n) => n.embedding === undefined);
    expect(embeddingless.map((n) => n.id)).toEqual(["doc:c", "doc:e"]);
    // Every PRESENT node carries its OWN vector (id-correct), never a neighbor's.
    for (const { id, embedding } of merged) {
      if (embedding === undefined) continue;
      expect(embedding).toEqual(vectorFor(nodeIds.indexOf(id)));
    }
  });

  it("resolves a duplicate node_id deterministically (last row wins)", () => {
    // A degenerate shape the live route never emits, but the join must not corrupt
    // identity if it does: the same id twice keeps the LAST row, not a silent
    // positional smear across two nodes.
    const dup = adaptGraphEmbeddings({
      embeddings: [
        { node_id: "doc:x", vector: vectorFor(1) },
        { node_id: "doc:x", vector: vectorFor(2) },
      ],
      generation: 0,
      truncated: null,
      tiers: { semantic: { available: true } },
    });
    const byId = embeddingsByNodeId(dup);
    expect(byId.size).toBe(1);
    expect(byId.get("doc:x")).toEqual(vectorFor(2));
  });

  it("the mock serves a node_id-keyed SUBSET through the real client path", async () => {
    // The mock mirrors the live wire: it serves a genuine `node_id`-keyed subset
    // (omitting at least one served document node's vector), so the by-id join and
    // the absence path are exercised against the mock that mirrors the live shape
    // (mock-mirrors-live-wire-shape).
    const mock = new MockEngine();
    const client = clientOn(mock);

    // The full served document node set from /graph/query (document granularity).
    const slice = await client.graphQuery({ scope: MOCK_SCOPE });
    const servedDocIds = new Set(
      slice.nodes.filter((n) => n.kind !== "feature").map((n) => n.id),
    );
    expect(servedDocIds.size).toBeGreaterThan(0);

    const res = await client.graphEmbeddings({ scope: MOCK_SCOPE });
    const byId = embeddingsByNodeId(res);

    // Every served vector keys a REAL served document node (no orphan vectors).
    for (const id of byId.keys()) {
      expect(servedDocIds.has(id)).toBe(true);
    }
    // The embeddings are a strict SUBSET: at least one served doc node carries no
    // vector — the honest-absence path the live route also exercises.
    expect(byId.size).toBeLessThan(servedDocIds.size);
    const absent = [...servedDocIds].filter((id) => !byId.has(id));
    expect(absent.length).toBeGreaterThan(0);

    // Each present node's vector is its OWN (the mock keys by id, never by order):
    // build scene nodes by the join and confirm every embedded node maps to a
    // served id, with the absent nodes left embeddingless.
    const sceneNodes = [...servedDocIds].map((id) =>
      engineNodeToScene({ id, kind: "adr", embedding: byId.get(id) }),
    );
    const embedded = sceneNodes.filter(
      (n) => Array.isArray(n.embedding) && n.embedding.length > 0,
    );
    expect(embedded).toHaveLength(byId.size);
  });
});
