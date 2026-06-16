// graph-lineage-dag W03.P10/P11/P12: the lineage derivation-DAG layout rebuilt
// as a full Sugiyama pipeline — axis ordering along the PROV chain, longest-path
// layering with dummy nodes, median crossing reduction, deterministic
// coordinate assignment, the off-spine precedence policy (feature-adjacency ->
// temporal -> gutter), index-manifest suppression, routed waypoints, and
// ceiling-gated aggregate-LOD. The golden-position determinism test (S47) fixes
// the same-inputs -> same-positions contract across re-runs and with a back-edge.

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { LINEAGE_AGGREGATE_THRESHOLD, lineageLayout } from "./lineageLayout";

type TestNode = SceneNodeData & {
  authorityClass?: string;
  dates?: { created?: string };
};

const n = (id: string, over?: Partial<TestNode>): TestNode => ({
  id,
  kind: "doc",
  ...over,
});
const lineageEdge = (src: string, dst: string, derivation: string): SceneEdgeData => ({
  id: `e:${src}->${dst}`,
  src,
  dst,
  relation: "rel",
  tier: "declared",
  confidence: 1,
  derivation,
});

describe("lineageLayout", () => {
  it("orders the derivation chain left-to-right by axis depth", () => {
    // research -grounds-> adr -authorizes-> plan -generated-by-> exec
    const nodes = [n("research"), n("adr"), n("plan"), n("exec")];
    const edges = [
      lineageEdge("research", "adr", "grounds"),
      lineageEdge("adr", "plan", "authorizes"),
      lineageEdge("plan", "exec", "generated-by"),
    ];
    const pos = lineageLayout(nodes, edges).positions;
    expect(pos.get("research")!.x).toBeLessThan(pos.get("adr")!.x);
    expect(pos.get("adr")!.x).toBeLessThan(pos.get("plan")!.x);
    expect(pos.get("plan")!.x).toBeLessThan(pos.get("exec")!.x);
    // The chain is four columns deep.
    expect(pos.get("exec")!.depth).toBe(3);
  });

  it("falls back to a readable 2D grid when no node is on the spine (no-derivation LOD)", () => {
    // e.g. lineage at feature/constellation granularity: aggregate nodes carry
    // meta-edges, not derivation edges, so the spine is empty. Must NOT collapse
    // to a single black gutter column — spread the nodes across BOTH axes.
    const nodes = Array.from({ length: 9 }, (_, i) => n(`feat-${i}`));
    const result = lineageLayout(nodes, []); // no lineage edges → empty spine
    const xs = new Set([...result.positions.values()].map((p) => Math.round(p.x)));
    const ys = new Set([...result.positions.values()].map((p) => Math.round(p.y)));
    expect(result.positions.size).toBe(9);
    // A grid spreads across multiple columns AND rows (not one x, not one y).
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
    // Deterministic: same inputs → same positions.
    const again = lineageLayout(nodes, []);
    expect([...again.positions]).toEqual([...result.positions]);
  });

  it("marks an incomplete chain as a dangling stub, never fabricating an edge", () => {
    // The plan derives from an adr that is NOT in the slice.
    const nodes = [n("plan"), n("exec")];
    const edges = [
      lineageEdge("adr-missing", "plan", "authorizes"),
      lineageEdge("plan", "exec", "generated-by"),
    ];
    const pos = lineageLayout(nodes, edges).positions;
    expect(pos.get("plan")!.dangling).toBe(true);
    // The exec's parent (plan) IS present, so it is not itself dangling.
    expect(pos.get("exec")!.dangling).toBe(false);
    // No position exists for the missing adr (no fabricated node).
    expect(pos.has("adr-missing")).toBe(false);
  });

  it("spreads an over-stacked column by crossing reduction, not a single x line", () => {
    // The vertical-stack defect: many exec records under one plan. Median
    // crossing reduction + coordinate assignment must give them DISTINCT
    // cross-axis (y) positions in the same depth column, not all-equal y.
    const plan = n("plan");
    const execs = Array.from({ length: 12 }, (_, i) => n(`exec-${i}`));
    const edges = execs.map((e) => lineageEdge("plan", e.id, "generated-by"));
    const pos = lineageLayout([plan, ...execs], edges).positions;
    const ys = new Set(execs.map((e) => pos.get(e.id)!.y));
    // All execs share the same depth column...
    const depths = new Set(execs.map((e) => pos.get(e.id)!.depth));
    expect(depths.size).toBe(1);
    // ...but spread across distinct rows (no 170:1 single-x stack).
    expect(ys.size).toBe(execs.length);
  });

  it("routes a multi-layer edge through dummy-node waypoints (D6)", () => {
    // a -> d spans three layers (a depth 0, d depth 3 via the b/c chain); the
    // a->d edge must carry routed intermediate waypoints, not a straight cut.
    const nodes = [n("a"), n("b"), n("c"), n("d")];
    const edges = [
      lineageEdge("a", "b", "grounds"),
      lineageEdge("b", "c", "authorizes"),
      lineageEdge("c", "d", "generated-by"),
      lineageEdge("a", "d", "grounds"), // spans 3 layers -> needs 2 dummies
    ];
    const result = lineageLayout(nodes, edges);
    const route = result.routes.get("e:a->d");
    expect(route).toBeDefined();
    // Two intermediate layers -> two waypoints between the endpoints.
    expect(route!.length).toBe(2);
  });

  it("places off-spine feature-tagged nodes by feature-adjacency, not a dead lane (D2)", () => {
    // A node with a feature tag and no derivation edge takes a feature-adjacency
    // column to the right of the spine, off the spine but informatively placed.
    const nodes = [
      n("adr"),
      n("orphan-a", { featureTags: ["alpha"] }),
      n("orphan-b", { featureTags: ["beta"] }),
    ];
    const edges = [lineageEdge("research", "adr", "grounds")];
    const pos = lineageLayout(nodes, edges).positions;
    expect(pos.get("orphan-a")!.onSpine).toBe(false);
    expect(pos.get("orphan-b")!.onSpine).toBe(false);
    // Different features -> different columns (informative placement).
    expect(pos.get("orphan-a")!.x).not.toBe(pos.get("orphan-b")!.x);
  });

  it("places a dated, feature-less off-spine node on the temporal axis (D2)", () => {
    const nodes = [
      n("adr"),
      n("dated", { dates: { created: "2026-01-01" } }),
      n("bare"),
    ];
    const edges = [lineageEdge("research", "adr", "grounds")];
    const pos = lineageLayout(nodes, edges).positions;
    // Both are off-spine, but the dated node takes the temporal column and the
    // bare node falls to the gutter — distinct x positions, both off-spine.
    expect(pos.get("dated")!.onSpine).toBe(false);
    expect(pos.get("bare")!.onSpine).toBe(false);
    expect(pos.get("dated")!.x).not.toBe(pos.get("bare")!.x);
  });

  it("suppresses index manifests from the spine (D5)", () => {
    // An index node (authority_class manifest) with a derivation-shaped edge is
    // NOT laid out on the spine; it is filtered out of the DAG. Its edge is
    // dropped from layering so it cannot inject a fan-out hub.
    const nodes = [
      n("plan"),
      n("exec"),
      n("idx", { authorityClass: "manifest", featureTags: ["alpha"] }),
    ];
    const edges = [
      lineageEdge("plan", "exec", "generated-by"),
      lineageEdge("idx", "exec", "generated-by"), // a manifest fan-out: suppressed
    ];
    const pos = lineageLayout(nodes, edges).positions;
    // The manifest is placed off-spine (via feature-adjacency), never on it.
    expect(pos.get("idx")!.onSpine).toBe(false);
    // The exec's only spine parent is the plan; the manifest edge did not make
    // the exec dangling via a phantom parent.
    expect(pos.get("exec")!.onSpine).toBe(true);
  });

  it("dedups the canonical spine edge so an exec is not double-counted (S41)", () => {
    // An exec reaches the spine via BOTH its plan wikilink AND its container
    // binding — two edges with the SAME (plan -> exec) generated-by shape. The
    // layout collapses them to one parent->child layering edge; the exec lands
    // in exactly one column at depth 1.
    const nodes = [n("plan"), n("exec")];
    const edges = [
      { ...lineageEdge("plan", "exec", "generated-by"), id: "e:wikilink" },
      { ...lineageEdge("plan", "exec", "generated-by"), id: "e:binding" },
    ];
    const pos = lineageLayout(nodes, edges).positions;
    expect(pos.get("exec")!.depth).toBe(1);
    expect(pos.get("exec")!.onSpine).toBe(true);
  });

  it("records advisory per-plan aggregates above the ceiling, NON-destructively (D8)", () => {
    // Above the aggregate threshold the per-plan grouping is recorded as ADVISORY
    // metadata (`aggregates`) — but NON-DESTRUCTIVELY (W03 review fix): every exec
    // keeps a real Sugiyama position rather than being collapsed out of the layout,
    // because no renderer draws the synthetic super-nodes yet. The destructive
    // collapse left the members with no position at all (origin pile-up on the live
    // 642-exec corpus).
    const plan = n("plan");
    const execCount = LINEAGE_AGGREGATE_THRESHOLD + 5;
    const execs = Array.from({ length: execCount }, (_, i) =>
      n(`exec-${String(i).padStart(4, "0")}`),
    );
    const edges = execs.map((e) => lineageEdge("plan", e.id, "generated-by"));
    const result = lineageLayout([plan, ...execs], edges);
    // The advisory super-node grouping exists, keyed per plan, carrying every
    // exec member — metadata for a future synthetic-node render channel.
    const superId = "agg:exec:plan";
    expect(result.aggregates.has(superId)).toBe(true);
    expect(result.aggregates.get(superId)!.memberIds.length).toBe(execCount);
    // The super-node is NOT placed (advisory only, nothing draws it).
    expect(result.positions.has(superId)).toBe(false);
    // Every served exec has a REAL spine position (no member is filtered out).
    for (const e of execs) {
      const p = result.positions.get(e.id);
      expect(p).toBeDefined();
      expect(p!.onSpine).toBe(true);
    }
  });

  it("places EVERY served exec above the ceiling — no origin pile-up (W03 F1)", () => {
    // The live-corpus regression: 642 execs (> the 600 threshold) under one plan.
    // Every served node must have a real Sugiyama position; none may stack at the
    // uninitialized origin. The crossing-reduced coordinate pass spreads the column
    // across distinct rows, so no two members share a position either.
    const plan = n("plan");
    const execCount = 642;
    const execs = Array.from({ length: execCount }, (_, i) =>
      n(`exec-${String(i).padStart(4, "0")}`),
    );
    const edges = execs.map((e) => lineageEdge("plan", e.id, "generated-by"));
    const result = lineageLayout([plan, ...execs], edges);
    expect(execCount).toBeGreaterThan(LINEAGE_AGGREGATE_THRESHOLD);

    // No served node is missing a position, and none piles at the origin {0,0}
    // (the uninitialized-position signature). The plan sits at column 0 (its real
    // spine origin) but the execs are spread across the next column's rows.
    const seenYByExec = new Set<number>();
    let originPileUp = 0;
    for (const e of execs) {
      const p = result.positions.get(e.id);
      expect(p).toBeDefined();
      // An exec at exactly {0,0} would be the origin pile-up; the exec column is
      // at depth 1 (x > 0), so a member there is the uninitialized signature.
      if (p!.x === 0 && p!.y === 0) originPileUp += 1;
      seenYByExec.add(p!.y);
    }
    expect(originPileUp).toBe(0);
    // The members are spread across distinct rows, not stacked on one another.
    expect(seenYByExec.size).toBeGreaterThan(1);
  });

  it("is cycle-safe: a derivation cycle does not loop forever", () => {
    const nodes = [n("x"), n("y")];
    const edges = [lineageEdge("x", "y", "grounds"), lineageEdge("y", "x", "grounds")];
    const pos = lineageLayout(nodes, edges).positions;
    expect(pos.has("x")).toBe(true);
    expect(pos.has("y")).toBe(true);
  });

  // W04.P11.S49: degenerate-input hardening — the lineage Sugiyama pipeline must
  // return finite, bounded, deterministic positions (no NaN, no throw, no infinite
  // loop) on EVERY degenerate input: empty, singleton, all-isolated (no spine),
  // a longer cycle where a DAG is expected, a self-loop, and a ceiling-sized slice.
  describe("degenerate-input hardening (S49)", () => {
    const finite = (r: ReturnType<typeof lineageLayout>) => {
      for (const [, p] of r.positions) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      }
      return true;
    };

    it("returns an empty result on an empty slice (no throw)", () => {
      const r = lineageLayout([], []);
      expect(r.positions.size).toBe(0);
      expect(r.routes.size).toBe(0);
    });

    it("places a single node finitely with the grid fallback (no spine)", () => {
      const r = lineageLayout([n("solo")], []);
      expect(r.positions.size).toBe(1);
      expect(finite(r)).toBe(true);
    });

    it("lays all-isolated nodes as a finite grid (no derivation edges at all)", () => {
      const nodes = Array.from({ length: 7 }, (_, i) => n(`iso-${i}`));
      const r = lineageLayout(nodes, []);
      expect(r.positions.size).toBe(7);
      expect(finite(r)).toBe(true);
    });

    it("removes back-edges on a longer cycle (a->b->c->a) without looping or NaN", () => {
      const nodes = [n("a"), n("b"), n("c")];
      const edges = [
        lineageEdge("a", "b", "grounds"),
        lineageEdge("b", "c", "authorizes"),
        lineageEdge("c", "a", "grounds"), // back-edge closing a 3-cycle
      ];
      const r = lineageLayout(nodes, edges);
      expect(r.positions.size).toBe(3);
      expect(finite(r)).toBe(true);
      // Deterministic across re-runs even with the cycle present.
      const again = lineageLayout(nodes, edges);
      expect([...again.positions]).toEqual([...r.positions]);
    });

    it("ignores a self-loop derivation edge (src === dst) without NaN", () => {
      const nodes = [n("plan"), n("exec")];
      const edges = [
        lineageEdge("plan", "plan", "generated-by"), // self-loop
        lineageEdge("plan", "exec", "generated-by"),
      ];
      const r = lineageLayout(nodes, edges);
      expect(finite(r)).toBe(true);
      expect(r.positions.has("plan")).toBe(true);
      expect(r.positions.has("exec")).toBe(true);
    });

    it("stays finite and bounded on a ceiling-sized fan (1 plan, many execs)", () => {
      const plan = n("plan");
      const execs = Array.from({ length: 1200 }, (_, i) =>
        n(`exec-${String(i).padStart(4, "0")}`),
      );
      const edges = execs.map((e) => lineageEdge("plan", e.id, "generated-by"));
      const r = lineageLayout([plan, ...execs], edges);
      expect(r.positions.size).toBe(execs.length + 1);
      expect(finite(r)).toBe(true);
    });
  });

  it("is a golden-position determinism: identical inputs yield identical positions (S47)", () => {
    const nodes = [
      n("research"),
      n("adr"),
      n("plan"),
      n("exec-1"),
      n("exec-2"),
      n("exec-3"),
      n("audit"),
    ];
    const edges = [
      lineageEdge("research", "adr", "grounds"),
      lineageEdge("adr", "plan", "authorizes"),
      lineageEdge("plan", "exec-1", "generated-by"),
      lineageEdge("plan", "exec-2", "generated-by"),
      lineageEdge("plan", "exec-3", "generated-by"),
      lineageEdge("exec-1", "audit", "reviews"),
    ];
    const first = lineageLayout(nodes, edges).positions;
    const second = lineageLayout(nodes, edges).positions;
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it("stays deterministic with an added back-edge (S47)", () => {
    // A back-edge (audit -> research) closes a cycle; cycle removal reverses it
    // deterministically, so the layout is still reproducible across re-runs.
    const nodes = [n("research"), n("adr"), n("plan"), n("audit")];
    const baseEdges = [
      lineageEdge("research", "adr", "grounds"),
      lineageEdge("adr", "plan", "authorizes"),
      lineageEdge("plan", "audit", "reviews"),
    ];
    const withBackEdge = [...baseEdges, lineageEdge("audit", "research", "grounds")];
    const a = lineageLayout(nodes, withBackEdge).positions;
    const b = lineageLayout(nodes, withBackEdge).positions;
    expect([...b.entries()]).toEqual([...a.entries()]);
    // Every node still receives a position (the back-edge node is not dropped).
    for (const id of ["research", "adr", "plan", "audit"]) {
      expect(a.has(id)).toBe(true);
    }
  });
});
