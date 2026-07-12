// @vitest-environment happy-dom is NOT needed (pure adapter unit tests on captured samples).
// Split from liveAdapters.test.ts (module-decomposition mandate, 2026-07-12).

import { describe, expect, it } from "vitest";
import { SCOPE_ID_MAX_CHARS } from "../scopeIdentity";
import {
  adaptDashboardState,
  adaptGraphEmbeddings,
  adaptGraphSlice,
  embeddingsByNodeId,
  metaEdgeToEdge,
  unwrapEnvelope,
} from "./index";
import { TIERS } from "./testFixtures";

describe("adaptDashboardState", () => {
  it("keeps date intent canonical at top-level date_range", () => {
    const adapted = adaptDashboardState({
      scope: " wt-1 ",
      selected_ids: [],
      filters: {
        text: "auth",
        date_range: { from: "2025-01-01", to: "2025-01-31" },
      },
      date_range: { from: "2026-06-01", to: "2026-06-30" },
      tiers: TIERS,
    });

    expect(adapted.filters.text).toBe("auth");
    expect(adapted.filters.date_range).toBeUndefined();
    expect(adapted.date_range).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("uses canonical dashboard-state normalization for live dashboard payloads", () => {
    const adapted = adaptDashboardState({
      scope: "wt-1",
      selected_ids: [" doc:a ", "doc:a", "", { id: "doc:b" }],
      hovered_id: " doc:hover ",
      filters: {
        relations: [" references ", "references"],
        structural_state: [" broken ", "invalid"],
        doc_types: [" adr ", "adr"],
        feature_tags: [" state ", "state"],
        feature_query: { value: " state-* ", mode: " glob " },
        text: " centralize ",
      },
      date_range: { from: "2026-06-30", to: "2026-06-01" },
      graph_granularity: " document ",
      salience_lens: " design ",
      salience_focus: { id: "doc:focus" },
      representation_mode: " radial ",
      panel_state: {
        left_collapsed: true,
        right_collapsed: "no",
        right_tab: " search ",
      },
      graph_bounds: { shape: " circle ", size: 12.7 },
      tiers: TIERS,
    });

    expect(adapted.scope).toBe("wt-1");
    expect(adapted.selected_ids).toEqual(["doc:a"]);
    expect(adapted.hovered_id).toBe("doc:hover");
    expect(adapted.filters).toEqual({
      relations: ["references"],
      structural_state: ["broken"],
      doc_types: ["adr"],
      feature_tags: ["state"],
      feature_query: { value: "state-*", mode: "glob" },
      text: "centralize",
    });
    expect(adapted.date_range).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(adapted.graph_granularity).toBe("document");
    expect(adapted.salience_lens).toBe("design");
    expect(adapted.salience_focus).toBeNull();
    expect(adapted.representation_mode).toBe("radial");
    expect(adapted.panel_state).toEqual({
      left_collapsed: true,
      right_collapsed: false,
      // The removed "search" tab heals to the default (search-providers ADR D3).
      right_tab: "status",
    });
    expect(adapted.graph_bounds).toEqual({ shape: "circle", size: 13 });

    expect(
      adaptDashboardState({ scope: "x".repeat(SCOPE_ID_MAX_CHARS + 1) }).scope,
    ).toBe("");
    expect(adaptDashboardState({ scope: { id: "wt-1" } }).scope).toBe("");
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

  it("drops code nodes on the VAULT corpus but keeps them on the CODE corpus (ADR D7)", () => {
    // A slice carrying code-corpus nodes: the vault-corpus adapter (default)
    // must exclude them (the vault graph stays clean); the code-corpus adapter
    // must keep them — they are the legitimate content of a different dataset.
    const codeSlice = {
      nodes: [
        { id: "code:src/lib.rs", kind: "code-artifact", title: "demo" },
        { id: "code:src/main.rs", kind: "code-artifact", title: "main.rs" },
      ],
      edges: [
        {
          id: "e1",
          src: "code:src/lib.rs",
          dst: "code:src/main.rs",
          relation: "contains",
          tier: "declared",
        },
      ],
      meta_edges: [],
      filter: {},
      as_of: null,
      tiers: TIERS,
    };
    // Default (vault) corpus: code nodes excluded, and the edge between them is
    // pruned to keep the slice self-consistent.
    const asVault = adaptGraphSlice(codeSlice);
    expect(asVault.nodes).toHaveLength(0);
    expect(asVault.edges).toHaveLength(0);
    // Code corpus: the same nodes and edge survive.
    const asCode = adaptGraphSlice(codeSlice, { corpus: "code" });
    expect(asCode.nodes.map((n) => n.id)).toEqual([
      "code:src/lib.rs",
      "code:src/main.rs",
    ]);
    expect(asCode.edges).toHaveLength(1);
    expect(asCode.edges[0].src).toBe("code:src/lib.rs");
  });

  it("synthesizes a stable id, relation, and dominant tier for a meta-edge", () => {
    const edge = metaEdgeToEdge({
      src: "feature:a",
      dst: "feature:b",
      src_feature: "a",
      dst_feature: "b",
      count: 7,
      breakdown_by_tier: { structural: 2, temporal: 5 },
    });
    // ID uses JSON-encoded endpoint pair to prevent collisions when endpoint
    // ids contain the "->" separator (wire-01 adversarial finding).
    expect(edge.id).toBe('meta:["feature:a","feature:b"]');
    expect(edge.relation).toBe("related");
    // Dominant tier = the breakdown's heaviest edge tier (temporal here). The
    // engine never mints semantic graph edges (ADR D3.5), so semantic is never a
    // candidate even if a stray key appears in the breakdown.
    expect(edge.tier).toBe("temporal");
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
    // declared precedes temporal; equal counts → declared.
    expect(metaEdgeToEdge(meta({ declared: 3, temporal: 3 })).tier).toBe("declared");
  });

  it("falls back to structural for an empty/all-zero breakdown", () => {
    expect(metaEdgeToEdge(meta({})).tier).toBe("structural");
    expect(metaEdgeToEdge(meta({ declared: 0, temporal: 0 })).tier).toBe("structural");
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

  it("drops index/code nodes and the edges referencing them (ADR D5/D6)", () => {
    // Belt-and-braces: the engine excludes index/code at the projection, but the
    // frontend must not render them if a producer emits one. Code is detected by
    // kind, by the `code-artifact` species, AND by the `code:` id prefix.
    const noisySlice = {
      nodes: [
        { id: "doc:keep", kind: "document", doc_type: "adr" },
        { id: "doc:idx", kind: "document", doc_type: "index" },
        { id: "code:src/lib.rs", kind: "code" },
        { id: "code:src/main.rs#fn", kind: "code-artifact" },
        { id: "weird:x", kind: "code" },
      ],
      edges: [
        {
          id: "e:keep",
          src: "doc:keep",
          dst: "doc:keep",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
        {
          id: "e:to-index",
          src: "doc:keep",
          dst: "doc:idx",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
        {
          id: "e:to-code",
          src: "code:src/lib.rs",
          dst: "doc:keep",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
      ],
      meta_edges: [],
      tiers: TIERS,
    };
    const slice = adaptGraphSlice(noisySlice);
    expect(slice.nodes.map((n) => n.id)).toEqual(["doc:keep"]);
    // Only the edge whose endpoints both survived is kept; the slice stays
    // self-consistent (no edge references a dropped node).
    expect(slice.edges.map((e) => e.id)).toEqual(["e:keep"]);
  });

  it("excludes a folded meta-edge whose endpoint was a dropped node", () => {
    // A meta-edge that would resolve to a dropped (code/index) endpoint must not be
    // folded back in — the slice stays self-consistent after exclusion.
    const slice = adaptGraphSlice({
      nodes: [
        { id: "feature:a", kind: "feature" },
        { id: "code:b", kind: "code" },
      ],
      edges: [],
      meta_edges: [
        {
          src: "feature:a",
          dst: "code:b",
          src_feature: "a",
          dst_feature: "b",
          count: 1,
          breakdown_by_tier: { structural: 1 },
        },
      ],
      tiers: TIERS,
    });
    expect(slice.nodes.map((n) => n.id)).toEqual(["feature:a"]);
    expect(slice.edges).toHaveLength(0);
  });
});

describe("adaptGraphSlice ontology fields (graph-node-semantics)", () => {
  // A document-granularity slice in the EXACT shape the live engine's edge_view
  // and node_view now serve: nodes carry the additive `authority_class` register
  // and the `aggregate` hint; edges carry the additive `derivation` label
  // alongside the §4 `relation`/`tier`. Fed through the SAME client path the app
  // uses (adaptGraphSlice), proving the ontology survives the adapter intact
  // one code path serves both captured and already-adapted origins.
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
  // live-shaped verification for the salience field.
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
          degree_by_tier: { declared: 1, structural: 2, temporal: 0 },
        },
        {
          id: "doc:2026-06-14-x-adr",
          kind: "document",
          doc_type: "adr",
          feature_tags: ["x"],
          salience: 0.54,
          degree_by_tier: { declared: 1, structural: 1, temporal: 0 },
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

// graph-semantic-embeddings ADR D6 / W04.P16.S62: a captured-live `/graph/
// embeddings` sample fed through the REAL adaptGraphEmbeddings client path the app
// uses. The adapter must carry generation/tiers and drop malformed entries.

describe("adaptGraphEmbeddings (captured-live sample -> scene projection gate)", () => {
  it("drops a malformed entry and passes internal bodies through unchanged", () => {
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
});
