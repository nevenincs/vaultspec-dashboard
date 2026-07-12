// @vitest-environment happy-dom is NOT needed (pure adapter unit tests on captured samples).
// Split from liveAdapters.test.ts (module-decomposition mandate, 2026-07-12).

import { describe, expect, it } from "vitest";
import { adaptFilters, adaptLineageSlice, adaptMap, adaptStatus } from "./index";
import { TIERS } from "./testFixtures";

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
