// Adapter tests against samples CAPTURED from the live serve origin
// (vaultspec serve, 2026-06-13) — the S49 contract-shape verification in
// executable form. Tolerance is tested too: already-adapted internal bodies
// pass through unchanged.

import { describe, expect, it } from "vitest";

import { adaptOpsWrite } from "./engine";
import type { OpsResult, SearchResult } from "./engine";
import {
  adaptFilters,
  adaptFileTree,
  adaptGitOp,
  adaptGraphEmbeddings,
  adaptDashboardState,
  adaptGraphSlice,
  adaptHistory,
  adaptIssues,
  adaptLineageSlice,
  adaptMap,
  adaptPipeline,
  adaptPlanInterior,
  adaptPrs,
  adaptSearch,
  adaptStatus,
  adaptVaultTree,
  codeNodeIdFromPath,
  deriveSearchNodeId,
  docTypeFromStem,
  embeddingsByNodeId,
  featureNodeIdFromTag,
  featureTagFromNodeId,
  GIT_CHANGED_FILES_MAX_ROWS,
  GIT_DIFF_LINE_MAX_CHARS,
  GIT_DIFF_MAX_HUNKS,
  GIT_DIFF_MAX_LINES,
  GIT_OP_OUTPUT_MAX_CHARS,
  GIT_OP_VERB_MAX_CHARS,
  GIT_PATH_MAX_CHARS,
  HISTORY_COMMIT_BODY_MAX_CHARS,
  HISTORY_COMMITS_MAX_ITEMS,
  HISTORY_STRING_MAX_CHARS,
  adaptNodeDetail,
  adaptNodeEvidence,
  mergeNumstat,
  metaEdgeToEdge,
  normalizeGitDiffStatus,
  parseGitNumstat,
  parseGitStatus,
  parseUnifiedDiff,
  SEARCH_RESULT_EXCERPT_MAX_CHARS,
  SEARCH_RESULT_IDENTITY_MAX_CHARS,
  SEARCH_RESULTS_MAX_ITEMS,
  unwrapEnvelope,
} from "./liveAdapters";
import { SCOPE_ID_MAX_CHARS } from "./scopeIdentity";
import { deriveEvidenceGroups } from "../view/hoverCardEvidence";

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

  it("passes already-adapted flat bodies through unchanged", () => {
    const body = { entries: [], tiers: TIERS };
    expect(unwrapEnvelope(body)).toBe(body);
  });
});

// The document write/create ops (document-editor backend). Each sample below is a
// REAL post-engine-wrap, pre-unwrap wire body the live `POST /ops/core/...` front
// door serves — the engine forwards core's sibling `{schema, status, data}`
// envelope VERBATIM under `data.envelope` with the tiers block, HTTP 200 for BOTH
// success and business-refusal. Feeding each through the SAME `unwrapEnvelope` +
// `adaptOpsWrite` path the client uses proves the adapter interprets the live
// shape, not just a copied fixture: the unwrap flattens
// `{data:{envelope}, tiers}` onto the `OpsResult`, and `adaptOpsWrite` discriminates
// on the envelope `status` + inner `data` fields, NEVER on an HTTP code.

describe("adaptOpsWrite (captured live wire samples)", () => {
  /** Replicate the client transport: unwrap the `{data, tiers}` envelope onto the
   *  flat `OpsResult` the adapter consumes. */
  const toResult = (wire: unknown): OpsResult => unwrapEnvelope(wire) as OpsResult;

  it("interprets a set-body success envelope as a `saved` result", () => {
    const wire = {
      data: {
        envelope: {
          schema: "vaultspec.vault.set-body.v1",
          status: "updated",
          data: { path: ".vault/adr/x.md", blob_hash: "c245abc", checks: [] },
        },
      },
      tiers: TIERS,
    };
    const result = adaptOpsWrite(toResult(wire));
    expect(result.kind).toBe("saved");
    if (result.kind === "saved") {
      expect(result.path).toBe(".vault/adr/x.md");
      expect(result.blobHash).toBe("c245abc");
      expect(result.checks).toEqual([]);
    }
  });

  it("interprets a blob-hash conflict envelope as a `conflict` result (200, not an HTTP error)", () => {
    const wire = {
      data: {
        envelope: {
          schema: "vaultspec.vault.set-body.v1",
          status: "failed",
          data: {
            message: "Blob-hash conflict: the document changed since it was read",
            conflict: true,
            expected: "aaaa",
            actual: "bbbb",
            path: ".vault/adr/x.md",
          },
        },
      },
      tiers: TIERS,
    };
    const result = adaptOpsWrite(toResult(wire));
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") {
      expect(result.expected).toBe("aaaa");
      expect(result.actual).toBe("bbbb");
      expect(result.path).toBe(".vault/adr/x.md");
    }
  });

  it("interprets a frontmatter refusal envelope as a `refused` result", () => {
    const wire = {
      data: {
        envelope: {
          schema: "vaultspec.vault.set-frontmatter.v1",
          status: "failed",
          data: {
            path: ".vault/adr/x.md",
            refused: true,
            checks: [
              {
                path: ".vault/adr/x.md",
                message: "related link `missing` resolves to no document",
                severity: "error",
                check: "frontmatter",
              },
            ],
            errors: ["related link `missing` resolves to no document"],
          },
        },
      },
      tiers: TIERS,
    };
    const result = adaptOpsWrite(toResult(wire));
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") {
      expect(result.checks).toHaveLength(1);
      expect(result.errors[0]).toContain("resolves to no document");
      expect(result.path).toBe(".vault/adr/x.md");
    }
  });

  it("interprets a create envelope as a `created` result", () => {
    const wire = {
      data: {
        envelope: {
          schema: "vaultspec.vault.add.v1",
          status: "created",
          data: {
            path: ".vault/research/2026-06-16-x-research.md",
            stem: "2026-06-16-x-research",
          },
        },
      },
      tiers: TIERS,
    };
    const result = adaptOpsWrite(toResult(wire));
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.path).toBe(".vault/research/2026-06-16-x-research.md");
      expect(result.stem).toBe("2026-06-16-x-research");
    }
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
        ahead: 2,
        behind: 1,
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
    expect(wt.dirty).toBe(true);
    expect(wt.ahead).toBe(2);
    expect(wt.behind).toBe(1);
    expect(adapted.repositories[0].branches[0]).toEqual({
      name: "main",
      kind: "default",
    });
  });

  it("normalizes workspace-map rows before they reach the worktree picker", () => {
    const adapted = adaptMap({
      workspace: " Y:/repo/.git ",
      branches: [
        { class: "default", name: " main " },
        { class: "feature", name: " feature/a " },
        { class: "other", name: "   " },
      ],
      worktrees: [
        {
          ahead: 2.9,
          behind: Number.NaN,
          dirty: true,
          degraded: [" structural ", "structural", "", 7],
          has_vault: "false",
          head_ref: " refs/heads/feature/a ",
          is_main: true,
          path: " Y:/repo ",
        },
        {
          has_vault: true,
          path: "   ",
        },
        "not a worktree",
      ],
      tiers: TIERS,
    });

    expect(adapted.repositories[0].path).toBe("Y:/repo/.git");
    expect(adapted.repositories[0].branches).toEqual([
      { name: "main", kind: "default" },
      { name: "feature/a", kind: "feature" },
    ]);
    expect(adapted.repositories[0].worktrees).toEqual([
      {
        id: "Y:/repo",
        path: "Y:/repo",
        branch: "feature/a",
        has_vault: false,
        is_default: true,
        degraded: ["structural"],
        dirty: true,
        ahead: 2,
      },
    ]);
  });

  it("passes the internal repositories shape through", () => {
    const internal = { repositories: [], tiers: TIERS };
    expect(adaptMap(internal)).toBe(internal);
  });
});

describe("adaptFileTree (code tree listing)", () => {
  it("normalizes file-tree rows before code-browser selection", () => {
    const adapted = adaptFileTree({
      path: " src ",
      entries: [
        {
          path: " src/main.ts ",
          kind: "file",
          has_children: true,
          node_id: " code:src/main.ts ",
        },
        {
          path: " src/components ",
          kind: "dir",
          has_children: true,
          node_id: "   ",
        },
        {
          path: "   ",
          kind: "dir",
          node_id: "code:blank",
        },
        "not an entry",
      ],
      truncated: {
        total_children: 10.8,
        returned_children: 3,
        reason: " capped ",
      },
      next_cursor: " next-page ",
      tiers: TIERS,
    });

    expect(adapted.path).toBe("src");
    expect(adapted.entries).toEqual([
      {
        path: "src/main.ts",
        kind: "file",
        has_children: false,
        node_id: "code:src/main.ts",
      },
      {
        path: "src/components",
        kind: "dir",
        has_children: true,
        node_id: "code:src/components",
      },
    ]);
    expect(adapted.truncated).toEqual({
      total_children: 10,
      returned_children: 3,
      reason: "capped",
    });
    expect(adapted.next_cursor).toBe("next-page");
  });

  it("drops malformed file-tree truncation and blank cursors", () => {
    const adapted = adaptFileTree({
      entries: [],
      truncated: {
        total_children: Number.NaN,
        returned_children: 3,
        reason: "bad total",
      },
      next_cursor: "   ",
      tiers: TIERS,
    });

    expect(adapted.truncated).toBeNull();
    expect(adapted.next_cursor).toBeUndefined();
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
    expect(adapted.git).toBeUndefined(); // this captured sample carried no git block
  });
});

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
      right_tab: "search",
    });
    expect(adapted.graph_bounds).toEqual({ shape: "circle", size: 13 });

    expect(
      adaptDashboardState({ scope: "x".repeat(SCOPE_ID_MAX_CHARS + 1) }).scope,
    ).toBe("");
    expect(adaptDashboardState({ scope: { id: "wt-1" } }).scope).toBe("");
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
    // the live origin, not only a copied fixture.
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

  it("passes a flat internal body through unchanged - the one-code-path property", () => {
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

  it("normalizes search result rows before controller interpretation", () => {
    const adapted = adaptSearch({
      envelope: {
        data: {
          results: [
            {
              path: " src/lib/auth.rs ",
              score: 1.4,
              text: " fn authenticate ",
            },
            {
              source: "  ",
              score: 0.3,
              excerpt: "blank source is malformed",
            },
            {
              stem: "2026-06-12-auth-flow-adr",
              score: Number.NaN,
              excerpt: "bad score is malformed",
            },
            "not a row",
          ],
        },
      },
      tiers: TIERS,
    });

    expect(adapted.results).toEqual([
      {
        score: 1,
        source: "src/lib/auth.rs",
        excerpt: "fn authenticate",
        node_id: "code:src/lib/auth.rs",
      },
    ]);
  });

  it("bounds live search result strings and accumulated rows at the adapter", () => {
    const overlongIdentity = "x".repeat(SEARCH_RESULT_IDENTITY_MAX_CHARS + 1);
    const overlongExcerpt = "e".repeat(SEARCH_RESULT_EXCERPT_MAX_CHARS + 8);
    const rows = [
      {
        path: overlongIdentity,
        score: 0.5,
        excerpt: "overlong identity is malformed",
      },
      ...Array.from({ length: SEARCH_RESULTS_MAX_ITEMS + 3 }, (_, index) => ({
        path: `src/search/result-${index}.ts`,
        score: 0.75,
        text: index === 0 ? overlongExcerpt : `match ${index}`,
      })),
    ];

    const adapted = adaptSearch({
      envelope: { data: { results: rows } },
      tiers: TIERS,
    }) as { results: SearchResult[] };

    expect(adapted.results).toHaveLength(SEARCH_RESULTS_MAX_ITEMS);
    expect(adapted.results[0].source).toBe("src/search/result-0.ts");
    expect(adapted.results[0].excerpt).toHaveLength(SEARCH_RESULT_EXCERPT_MAX_CHARS);
    expect(adapted.results.at(-1)?.source).toBe(
      `src/search/result-${SEARCH_RESULTS_MAX_ITEMS - 1}.ts`,
    );
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

describe("codeNodeIdFromPath (shared code identity grammar)", () => {
  it("derives the contract code-artifact node id from a repo path", () => {
    expect(codeNodeIdFromPath("src/lib/auth.rs")).toBe("code:src/lib/auth.rs");
  });
});

describe("feature node identity grammar", () => {
  it("derives and parses synthesized feature node ids through one helper pair", () => {
    expect(featureNodeIdFromTag("auth-flow")).toBe("feature:auth-flow");
    expect(featureTagFromNodeId("feature:auth-flow")).toBe("auth-flow");
    expect(featureTagFromNodeId("doc:auth-flow")).toBeNull();
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

  it("normalizes vault-tree rows before browser grouping", () => {
    const adapted = adaptVaultTree({
      entries: [
        {
          stem: " 2026-06-12-dashboard-gui-plan ",
          feature_tags: [" dashboard-gui ", "dashboard-gui", "", 42],
          dates: { created: " 2026-06-12 ", modified: "   " },
          status: " proposed ",
          tier: " L2 ",
          progress: { done: 2.9, total: 5.1 },
        },
        {
          path: " .vault/adr/2026-06-12-dashboard-gui-adr.md ",
          doc_type: " adr ",
          feature_tags: [" design "],
          dates: { modified: " 2026-06-13 " },
          progress: { done: 5, total: 2 },
        },
        {
          stem: "   ",
          feature_tags: ["bad"],
        },
        "not a row",
      ],
      tiers: TIERS,
    });

    expect(adapted.entries).toEqual([
      {
        path: ".vault/plan/2026-06-12-dashboard-gui-plan.md",
        doc_type: "plan",
        feature_tags: ["dashboard-gui"],
        dates: { created: "2026-06-12" },
        status: "proposed",
        tier: "L2",
        progress: { done: 2, total: 5 },
      },
      {
        path: ".vault/adr/2026-06-12-dashboard-gui-adr.md",
        doc_type: "adr",
        feature_tags: ["design"],
        dates: { modified: "2026-06-13" },
      },
    ]);
  });

  it("derives the full stem-suffix vocabulary", () => {
    expect(docTypeFromStem("2026-06-12-x-plan")).toBe("plan");
    expect(docTypeFromStem("2026-06-12-x-research")).toBe("research");
    expect(docTypeFromStem("2026-06-12-x-P01-summary")).toBe("exec");
    // `.index` (`.vault/index` feature-index) is a strictly-ignored metanode
    // (index-node-exclusion ADR): no `index` doc-type, falls through to document.
    expect(docTypeFromStem("dashboard-gui.index")).toBe("document");
    expect(docTypeFromStem("mystery")).toBe("document");
  });
});

// --- dashboard-pipeline-wire W05.P12: consumer fidelity ----------------------------

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

  it("drops malformed pipeline artifacts and normalizes metadata", () => {
    const adapted = adaptPipeline({
      artifacts: [
        {
          node_id: " doc:2026-06-14-x-plan ",
          stem: " 2026-06-14-x-plan ",
          title: " x plan ",
          doc_type: " plan ",
          tier: " L3 ",
          progress: { done: 2, total: Number.NaN },
          phase: " execute ",
          feature_tags: [" work ", "work", "", 7],
          dates: { created: " 2026-06-14 ", modified: " " },
        },
        { stem: "missing-node-id", phase: "adr" },
        null,
      ],
      tiers: TIERS,
    });

    expect(adapted.artifacts).toHaveLength(1);
    expect(adapted.artifacts[0]).toMatchObject({
      node_id: "doc:2026-06-14-x-plan",
      stem: "2026-06-14-x-plan",
      title: "x plan",
      doc_type: "plan",
      tier: "L3",
      feature_tags: ["work"],
      dates: { created: "2026-06-14", modified: undefined },
      phase: "execute",
    });
    expect(adapted.artifacts[0].progress).toBeUndefined();
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

  it("drops malformed plan-interior rows and normalizes renderable ids", () => {
    const adapted = adaptPlanInterior({
      interior: {
        plan_node_id: " doc:plan ",
        waves: [
          {
            node_id: " plan:wave ",
            id: " W01 ",
            heading: " Wave ",
            phases: [
              {
                node_id: " plan:phase ",
                id: " P01 ",
                heading: " Phase ",
                steps: [
                  {
                    node_id: " plan:step ",
                    id: " S01 ",
                    action: " Do work ",
                    exec_node_id: " doc:exec ",
                    done: true,
                  },
                  { id: "S02", done: false },
                ],
              },
              { node_id: "   ", id: "P02", steps: [] },
            ],
          },
          { id: "W02", phases: [] },
        ],
        phases: [{ node_id: " plan:flat-phase ", id: " P99 ", steps: [null] }],
        steps: [{ node_id: " plan:flat-step ", id: " S99 ", action: " Flat " }, null],
      },
      tiers: TIERS,
    });

    expect(adapted.interior.plan_node_id).toBe("doc:plan");
    expect(adapted.interior.waves).toHaveLength(1);
    expect(adapted.interior.waves[0]).toMatchObject({
      node_id: "plan:wave",
      id: "W01",
      heading: "Wave",
    });
    expect(adapted.interior.waves[0].phases).toHaveLength(1);
    expect(adapted.interior.waves[0].phases[0]).toMatchObject({
      node_id: "plan:phase",
      id: "P01",
      heading: "Phase",
    });
    expect(adapted.interior.waves[0].phases[0].steps).toEqual([
      {
        node_id: "plan:step",
        id: "S01",
        action: "Do work",
        exec_node_id: "doc:exec",
        done: true,
      },
    ]);
    expect(adapted.interior.phases).toEqual([
      { node_id: "plan:flat-phase", id: "P99", steps: [] },
    ]);
    expect(adapted.interior.steps).toEqual([
      { node_id: "plan:flat-step", id: "S99", action: "Flat", done: false },
    ]);
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

  it("bounds git op verb and output at the adapter boundary", () => {
    const adapted = adaptGitOp({
      verb: "x".repeat(GIT_OP_VERB_MAX_CHARS + 1),
      output: "d".repeat(GIT_OP_OUTPUT_MAX_CHARS + 1),
      tiers: TIERS,
    });

    expect(adapted.verb).toBe("");
    expect(adapted.output).toHaveLength(GIT_OP_OUTPUT_MAX_CHARS);
    expect(adapted.truncated).toEqual({
      returned_chars: GIT_OP_OUTPUT_MAX_CHARS,
      reason: "git output ceiling",
    });
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

  it("drops malformed porcelain status rows before they reach changed-files state", () => {
    const overlongPath = "x".repeat(GIT_PATH_MAX_CHARS + 1);
    const output =
      "## main\n" +
      "   \n" +
      " M    \n" +
      "ZZ src/bad-code.ts\n" +
      "M\tsrc/bad-separator.ts\n" +
      "!! ignored.tmp\n" +
      "R  src/old.ts ->    \n" +
      ` M ${overlongPath}\n` +
      " M src/ok.ts\n";

    expect(parseGitStatus(output).map((f) => f.path)).toEqual(["src/ok.ts"]);
  });

  it("bounds changed-file status and numstat accumulators", () => {
    const statusOutput = Array.from(
      { length: GIT_CHANGED_FILES_MAX_ROWS + 1 },
      (_, index) => ` M src/file-${index}.ts`,
    ).join("\n");
    const status = parseGitStatus(statusOutput);
    expect(status).toHaveLength(GIT_CHANGED_FILES_MAX_ROWS);
    expect(status.at(-1)?.path).toBe(`src/file-${GIT_CHANGED_FILES_MAX_ROWS - 1}.ts`);

    const numstatOutput = Array.from(
      { length: GIT_CHANGED_FILES_MAX_ROWS + 1 },
      (_, index) => `1\t0\tsrc/file-${index}.ts`,
    ).join("\n");
    const tallies = parseGitNumstat(numstatOutput);
    expect(tallies.size).toBe(GIT_CHANGED_FILES_MAX_ROWS);
    expect(tallies.has(`src/file-${GIT_CHANGED_FILES_MAX_ROWS}.ts`)).toBe(false);
  });

  it("parses numstat tallies and reconciles them onto status entries (binary → null)", () => {
    const numstat = "3\t1\tsrc/a.ts\n-\t-\timg/logo.png\n";
    const tallies = parseGitNumstat(numstat);
    expect(tallies.get("src/a.ts")).toEqual({ adds: 3, dels: 1 });
    expect(tallies.get("img/logo.png")).toEqual({ adds: null, dels: null });
    const merged = mergeNumstat(parseGitStatus("## main\n M src/a.ts\n"), tallies);
    expect(merged[0]).toMatchObject({ path: "src/a.ts", adds: 3, dels: 1 });
  });

  it("distinguishes a binary entry (numstat -\\t- row) from an untracked entry (no row)", () => {
    // A binary file HAS a numstat row with both tallies null → binary; an
    // untracked file has NO numstat row → null tallies but NOT binary.
    const tallies = parseGitNumstat("-\t-\timg/logo.png\n");
    const merged = mergeNumstat(
      parseGitStatus("## main\n M img/logo.png\n?? notes/new.txt\n"),
      tallies,
    );
    const binary = merged.find((e) => e.path === "img/logo.png");
    const untracked = merged.find((e) => e.path === "notes/new.txt");
    expect(binary).toMatchObject({ adds: null, dels: null, binary: true });
    expect(untracked?.adds).toBeNull();
    expect(untracked?.dels).toBeNull();
    expect(untracked?.binary ?? false).toBe(false);
  });

  it("drops malformed numstat rows before reconciliation", () => {
    const tallies = parseGitNumstat(
      "abc\t1\tsrc/bad-adds.ts\n" +
        "1\tNaN\tsrc/bad-dels.ts\n" +
        "2\t0\t   \n" +
        "4\t2\tsrc/ok.ts\n",
    );

    expect([...tallies.keys()]).toEqual(["src/ok.ts"]);
    expect(tallies.get("src/ok.ts")).toEqual({ adds: 4, dels: 2 });
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

  it("bounds parsed unified diff hunks, lines, line text, and path identity", () => {
    const manyHunks = Array.from(
      { length: GIT_DIFF_MAX_HUNKS + 1 },
      (_, index) => `@@ -${index + 1} +${index + 1} @@\n line-${index}`,
    ).join("\n");
    const hunkCapped = parseUnifiedDiff(manyHunks, " diff.md ");
    expect(hunkCapped.path).toBe("diff.md");
    expect(hunkCapped.hunks).toHaveLength(GIT_DIFF_MAX_HUNKS);
    expect(hunkCapped.truncated).toEqual({
      total_hunks: GIT_DIFF_MAX_HUNKS + 1,
      returned_hunks: GIT_DIFF_MAX_HUNKS,
      reason: "hunk ceiling",
    });

    const lineCapped = parseUnifiedDiff(
      `@@ -1 +1 @@\n${Array.from(
        { length: GIT_DIFF_MAX_LINES + 1 },
        (_, index) => ` line-${index}`,
      ).join("\n")}`,
      "diff.md",
    );
    expect(lineCapped.hunks[0].lines).toHaveLength(GIT_DIFF_MAX_LINES);
    expect(lineCapped.truncated).toEqual({
      total_hunks: 1,
      returned_hunks: 1,
      reason: "line ceiling",
    });

    const longLine = "x".repeat(GIT_DIFF_LINE_MAX_CHARS + 1);
    const textCapped = parseUnifiedDiff(`@@ -1 +1 @@\n+${longLine}`, "diff.md");
    expect(textCapped.hunks[0].lines[0].text).toHaveLength(GIT_DIFF_LINE_MAX_CHARS);
    expect(textCapped.truncated).toEqual({
      total_hunks: 1,
      returned_hunks: 1,
      reason: "line length ceiling",
    });

    expect(parseUnifiedDiff("@@ -1 +1 @@\n same", "   ").path).toBe("");
  });

  it("normalizes optional git diff status letters at the adapter boundary", () => {
    const diff =
      "diff --git a/x.md b/x.md\n" +
      "--- a/x.md\n+++ b/x.md\n" +
      "@@ -1 +1 @@\n" +
      "-old\n+new\n";

    expect(normalizeGitDiffStatus(" m ")).toBe("M");
    expect(normalizeGitDiffStatus("??")).toBeUndefined();
    expect(normalizeGitDiffStatus({ status: "M" })).toBeUndefined();
    expect(parseUnifiedDiff(diff, "x.md", " r ").status).toBe("R");
    expect(parseUnifiedDiff(diff, "x.md", "renamed").status).toBeUndefined();
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

describe("status + tier facets carried by live-shaped vault tree samples (W05.P12.S65)", () => {
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
});

describe("enriched node-evidence consumer fidelity (figma-parity-reconciliation S18)", () => {
  // A sample CAPTURED from the live `/nodes/{id}/evidence` wire under the S13
  // enrichment: the `{data, tiers}` envelope carrying the GUI `NodeEvidence`
  // shape — documents as `{ path, doc_type }`, code locations as
  // `{ path, symbol?, line?, state? }`, and commits carrying the `subject`.
  // Feeding it through the SAME unwrap path the app uses verifies the enriched
  // evidence shape.
  const liveEvidence = {
    data: {
      documents: [
        { path: ".vault/adr/2026-06-14-x-adr.md", doc_type: "adr" },
        { path: ".vault/plan/2026-06-14-x-plan.md", doc_type: "plan" },
      ],
      code_locations: [
        { path: "src/lib.rs", symbol: "build", line: 42, state: "resolved" },
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
      code_locations: {
        path: string;
        symbol?: string;
        line?: number;
        state?: string;
      }[];
      commits: { sha: string; subject: string; rule?: string }[];
      tiers: typeof TIERS;
    };
    // Documents carry path + doc_type (not bare stems).
    expect(ev.documents[0]).toEqual({
      path: ".vault/adr/2026-06-14-x-adr.md",
      doc_type: "adr",
    });
    expect(ev.code_locations[0]).toEqual({
      path: "src/lib.rs",
      symbol: "build",
      line: 42,
      state: "resolved",
    });
    // Commits carry the subject (the previously-missing git lookup datum).
    expect(ev.commits[0].subject).toBe("feat: the enriched commit");
    expect(ev.tiers.semantic.available).toBe(false);
  });
});

describe("historical text-diff consumer fidelity (figma-parity-reconciliation S18)", () => {
  // A sample CAPTURED from the live `/ops/git/histdiff` wire: a two-rev unified
  // diff forwarded VERBATIM inside `{data: {verb, output}, tiers}`. Fed through
  // the SAME unwrap + adapter path the app uses verifies the historical diff route.
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

  it("normalizes history identities at the live adapter boundary", () => {
    const res = adaptHistory({
      commits: [
        {
          hash: " abcdef0123456789abcdef0123456789abcdef01 ",
          short_hash: " abcdef01 ",
          subject: " fix: trim presentation identity ",
          body: "\n\nbody text\n",
          ts: Number.NaN,
          node_ids: [
            " doc:a ",
            "doc:a",
            "",
            "commit:abcdef0123456789abcdef0123456789abcdef01",
            42,
          ],
        },
        { hash: "   ", subject: "blank hash is malformed" },
      ],
      next_cursor: " cursor:2 ",
      tiers: TIERS,
    });

    expect(res.commits).toHaveLength(1);
    expect(res.commits[0]).toMatchObject({
      hash: "abcdef0123456789abcdef0123456789abcdef01",
      short_hash: "abcdef01",
      subject: "fix: trim presentation identity",
      body: "\n\nbody text\n",
      ts: 0,
      node_ids: ["doc:a", "commit:abcdef0123456789abcdef0123456789abcdef01"],
    });
    expect(res.next_cursor).toBe("cursor:2");
  });

  it("bounds history commit rows and string payloads at the adapter boundary", () => {
    const overlongString = "x".repeat(HISTORY_STRING_MAX_CHARS + 1);
    const overlongBody = "b".repeat(HISTORY_COMMIT_BODY_MAX_CHARS + 1);
    const commits = Array.from(
      { length: HISTORY_COMMITS_MAX_ITEMS + 1 },
      (_, index) => ({
        hash: `abcdef0123456789abcdef0123456789abcdef${String(index % 10).padStart(
          2,
          "0",
        )}`,
        short_hash: `short-${index}`,
        subject: index === 0 ? overlongString : `commit ${index}`,
        body: index === 0 ? overlongBody : "",
        ts: index,
      }),
    );

    const res = adaptHistory({
      commits,
      next_cursor: overlongString,
      tiers: TIERS,
    });

    expect(res.commits).toHaveLength(HISTORY_COMMITS_MAX_ITEMS);
    expect(res.commits[0].subject).toBe("");
    expect(res.commits[0].body).toHaveLength(HISTORY_COMMIT_BODY_MAX_CHARS);
    expect(res.next_cursor).toBeNull();
    expect(res.truncated).toEqual({
      requested: HISTORY_COMMITS_MAX_ITEMS + 1,
      returned: HISTORY_COMMITS_MAX_ITEMS,
      reason: "adapter commit ceiling",
    });
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

describe("adaptGitHub work items (status-overview /prs and /issues)", () => {
  it("normalizes PR identities, text, dates, checks, and unavailable reason", () => {
    const res = adaptPrs({
      prs: [
        {
          number: 42,
          title: " Centralize status rows ",
          author: " octo ",
          state: " OPEN ",
          is_draft: true,
          url: " https://example.test/pr/42 ",
          created_at: " 2026-06-18T00:00:00Z ",
          updated_at: "   ",
          merged_at: " 2026-06-19T00:00:00Z ",
          review_decision: " APPROVED ",
          checks: { total: 3.8, passed: 3, failing: -1, pending: Number.NaN },
        },
        { number: 0, title: "invalid number" },
      ],
      available: false,
      reason: " gh not authenticated ",
      tiers: TIERS,
    });

    expect(res.prs).toHaveLength(1);
    expect(res.prs[0]).toMatchObject({
      number: 42,
      title: "Centralize status rows",
      author: "octo",
      state: "OPEN",
      is_draft: true,
      url: "https://example.test/pr/42",
      created_at: "2026-06-18T00:00:00Z",
      updated_at: null,
      merged_at: "2026-06-19T00:00:00Z",
      review_decision: "APPROVED",
      checks: { total: 3, passed: 3, failing: 0, pending: 0 },
    });
    expect(res.available).toBe(false);
    expect(res.reason).toBe("gh not authenticated");
    expect(res.tiers).toBe(TIERS);
  });

  it("normalizes issue rows and bounds labels at the adapter boundary", () => {
    const labels = Array.from({ length: 40 }, (_, i) => ` label-${i} `);
    const res = adaptIssues({
      issues: [
        {
          number: 7,
          title: " Harden state boundary ",
          author: " octo ",
          state: " OPEN ",
          url: " https://example.test/issues/7 ",
          created_at: " 2026-06-18T00:00:00Z ",
          updated_at: "   ",
          labels: [" state ", "ui", "state", "", 42, ...labels],
        },
        { number: Number.NaN, title: "invalid number" },
      ],
      available: true,
      reason: "   ",
      tiers: TIERS,
    });

    expect(res.issues).toHaveLength(1);
    expect(res.issues[0]).toMatchObject({
      number: 7,
      title: "Harden state boundary",
      author: "octo",
      state: "OPEN",
      url: "https://example.test/issues/7",
      created_at: "2026-06-18T00:00:00Z",
      updated_at: null,
    });
    expect(res.issues[0].labels).toHaveLength(32);
    expect(res.issues[0].labels.slice(0, 4)).toEqual([
      "state",
      "ui",
      "label-0",
      "label-1",
    ]);
    expect(res.reason).toBeNull();
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

describe("adaptNodeDetail (live nested {detail:{bundle}} wire, hover-card summary)", () => {
  // The shape `unwrapEnvelope` hands this adapter: the envelope's `data` flattened
  // with the tiers block (the nested context bundle is preserved under `detail`).
  const live = {
    detail: {
      bundle: {
        node: {
          id: "doc:foo-research",
          kind: "document",
          doc_type: "research",
          title: "Foo",
        },
        edges_by_tier: {},
        neighbors: [],
        degree_by_tier: {},
      },
    },
    summary: "The first prose line of the doc.",
    tiers: TIERS,
  };

  it("flattens the nested context bundle to a top-level node + summary", () => {
    const detail = adaptNodeDetail(live);
    expect(detail.node.id).toBe("doc:foo-research");
    expect(detail.node.doc_type).toBe("research");
    expect(detail.summary).toBe("The first prose line of the doc.");
    expect(detail.tiers).toEqual(TIERS);
  });

  it("omits the summary when the wire carries none (a feature node)", () => {
    const detail = adaptNodeDetail({
      detail: { bundle: { node: { id: "feature:x", kind: "feature", title: "X" } } },
      summary: null,
      tiers: TIERS,
    });
    expect(detail.node.id).toBe("feature:x");
    expect(detail.summary).toBeUndefined();
  });

  it("passes an already-flat (mock/internal) body through unchanged", () => {
    const flat = {
      node: { id: "doc:bar", kind: "document", doc_type: "plan", title: "Bar" },
      summary: "Bar summary.",
      tiers: TIERS,
    };
    const detail = adaptNodeDetail(flat);
    expect(detail.node.id).toBe("doc:bar");
    expect(detail.summary).toBe("Bar summary.");
  });

  it("tolerates a malformed body with a degraded (empty-tiers, no-node) result", () => {
    const detail = adaptNodeDetail(null);
    expect(detail.node).toBeUndefined();
    expect(detail.summary).toBeUndefined();
    expect(detail.tiers).toEqual({});
  });
});

describe("adaptNodeEvidence (live /nodes/{id}/evidence; serde-omitted empty arrays)", () => {
  // The shape `unwrapEnvelope` hands this adapter: the evidence fields flattened to
  // the top level with the tiers block a sibling. The engine serde OMITS an empty
  // evidence array, so a node with no code locations arrives MISSING `code_locations`.
  it("floors each omitted evidence array to [] (the crash the raw consumer hit)", () => {
    // A doc node with documents + commits but NO code_locations key on the wire.
    const evidence = adaptNodeEvidence({
      documents: [{ path: ".vault/adr/x.md", doc_type: "adr" }],
      commits: [{ sha: "abc1234", subject: "do a thing" }],
      tiers: TIERS,
    });
    expect(evidence.documents).toHaveLength(1);
    expect(evidence.commits).toHaveLength(1);
    expect(evidence.code_locations).toEqual([]); // omitted on the wire → floored
    expect(evidence.tiers).toEqual(TIERS);
  });

  it("yields three empty arrays + empty tiers for an absent/odd body", () => {
    const evidence = adaptNodeEvidence(null);
    expect(evidence.documents).toEqual([]);
    expect(evidence.code_locations).toEqual([]);
    expect(evidence.commits).toEqual([]);
    expect(evidence.tiers).toEqual({});
  });

  it("the adapted evidence folds without throwing — the panel no longer crashes", () => {
    // The exact regression: a payload MISSING `code_locations` must fold to bounded
    // groups, never read `.length` of undefined (the stage-panel ErrorBoundary crash).
    const evidence = adaptNodeEvidence({
      documents: [{ path: ".vault/plan/p.md", doc_type: "plan" }],
      tiers: TIERS,
    });
    const groups = deriveEvidenceGroups(evidence);
    expect(groups.map((g) => g.heading)).toEqual(["documents"]); // only the present group
    // And the pure fold is itself robust to a directly-omitted array (defensive floor).
    expect(() =>
      deriveEvidenceGroups({ documents: [], tiers: TIERS } as never),
    ).not.toThrow();
  });
});
