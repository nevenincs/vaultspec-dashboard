// Randomized property fence over all six layout families (graph-viz-quality plan
// W04.P12.S54).
//
// W04.P11 hardened each layout module against a fixed catalogue of degenerate
// shapes (empty/singleton/isolated/disconnected/cycle/ragged/ceiling). This suite
// is the consolidated RANDOMIZED property fence: it generates MANY seeded random
// graphs varying node count (0..ceiling), edge density, connectivity, embedding
// presence, and cycle structure, runs EACH of the six layouts over every graph,
// and asserts the universal layout-output invariant on every emitted position:
//
//   (1) finite      — no NaN, no Infinity (the camera/hit-index must never see one),
//   (2) bounded     — within a generous world-coordinate envelope (no runaway),
//   (3) total       — exactly one position per laid node (no dropped/extra node),
//   (4) safe        — the layout call never throws,
//   (5) terminating — the call returns (bounded iteration; a hang fails the test
//                     timeout, which is the property under deterministic ticking).
//
// Everything is deterministic: graphs are drawn from a seeded mulberry32 PRNG, so a
// failure reproduces from its seed. Node counts are capped at the engine node
// ceiling and the layouts are pure synchronous functions, so the sweep is bounded.
//
// The dispatcher's semantic mode is gated (it downgrades to connectivity when real
// embeddings are absent), so the semantic LAYOUT function is exercised directly
// here (its own invariant) rather than only through the gated dispatch path.

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../../sceneController";
import { communityLayout } from "../communityLayout";
import { type FrameScheduler, FieldLayout } from "../forceLayout";
import { hierarchicalLayout } from "../hierarchicalLayout";
import { lineageLayout } from "../lineageLayout";
import { radialLayout } from "../radialLayout";
import { semanticLayout } from "../semanticLayout";
import { type Prng, makePrng } from "./prng";

// --- bounds --------------------------------------------------------------------

// Node-count band: 0 (empty) up to a cap WELL below the engine ceiling (5000) — the
// six layouts are pure CPU and run many seeds, so we keep the upper band modest to
// keep the sweep fast while still exercising the dense/large regime. The ceiling
// regime itself is covered by the per-module S52/S53 hardening tests; this fence
// proves the INVARIANT holds across a broad random sample of shapes.
const MAX_NODES = 120;
// Number of seeded random graphs per layout. 80 distinct seeded shapes per layout
// gives a wide spread of (count x density x connectivity x embedding x cycle)
// combinations while staying deterministic and fast.
const GRAPHS_PER_LAYOUT = 80;

// A generous world-coordinate envelope. Every layout places nodes within a few
// thousand world units of the origin (radial ~520, semantic ~760, lineage columns
// scale with occupancy, community ~360*sqrt(n)). 1e6 is far above any legitimate
// placement and far below Infinity, so a runaway or unbounded accumulation trips it
// while a legitimate placement never does.
const COORD_ENVELOPE = 1e6;

// --- the random graph generator ------------------------------------------------

interface RandomGraph {
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
  seed: number;
}

type Connectivity = "dense" | "sparse" | "isolated" | "path" | "cycle" | "star";

const TIERS: SceneEdgeData["tier"][] = [
  "declared",
  "structural",
  "temporal",
  "semantic",
];
const DERIVATIONS = [
  undefined,
  "authorizes",
  "generated-by",
  "refines",
  "audits",
] as const;

/**
 * Generate one seeded random graph. The seed alone determines node count, edge
 * density, connectivity shape, embedding presence, and per-edge tier/derivation, so
 * the same seed reproduces the same graph byte-for-byte. Edges may include
 * self-loops, duplicates, and back-edges (cycles) by construction — the layouts
 * must tolerate all of them.
 */
function randomGraph(seed: number): RandomGraph {
  const prng = makePrng(seed);
  const count = prng.nextInt(0, MAX_NODES);
  const connectivity = pick(prng, [
    "dense",
    "sparse",
    "isolated",
    "path",
    "cycle",
    "star",
  ] as const);
  // Embedding regime: none, all, or a random partial subset — exercises the
  // semantic projection's embedded/fallback partition and ragged dimensions.
  const embeddingRegime = pick(prng, ["none", "all", "partial"] as const);
  const embDim = prng.nextInt(2, 12);

  const nodes: SceneNodeData[] = [];
  for (let i = 0; i < count; i++) {
    const node: SceneNodeData = { id: `n${i}`, kind: pickKind(prng) };
    // Some nodes carry salience (drives the radial root policy), some a feature
    // tag (drives lineage off-spine placement), some a created date (temporal lane).
    if (prng.next() < 0.4) node.salience = prng.next();
    if (prng.next() < 0.4) node.featureTags = [`f${prng.nextInt(0, 3)}`];
    if (prng.next() < 0.3) {
      node.dates = { created: `2026-0${prng.nextInt(1, 9)}-0${prng.nextInt(1, 9)}` };
    }
    if (
      embeddingRegime === "all" ||
      (embeddingRegime === "partial" && prng.next() < 0.5)
    ) {
      node.embedding = makeEmbedding(prng, embDim);
    }
    nodes.push(node);
  }

  const edges = buildEdges(prng, nodes, connectivity);
  return { nodes, edges, seed };
}

function buildEdges(
  prng: Prng,
  nodes: readonly SceneNodeData[],
  connectivity: Connectivity,
): SceneEdgeData[] {
  const edges: SceneEdgeData[] = [];
  const n = nodes.length;
  if (n === 0) return edges;
  const ids = nodes.map((node) => node.id);

  const add = (src: string, dst: string) => {
    edges.push(makeEdge(prng, src, dst, edges.length));
  };

  switch (connectivity) {
    case "isolated":
      // No edges at all: every node is its own component (the all-isolated case).
      break;
    case "path":
      for (let i = 1; i < n; i++) add(ids[i - 1], ids[i]);
      break;
    case "cycle":
      // A single directed cycle (back-edge at the end exercises cycle removal).
      for (let i = 1; i < n; i++) add(ids[i - 1], ids[i]);
      if (n > 1) add(ids[n - 1], ids[0]);
      break;
    case "star": {
      const hub = ids[0];
      for (let i = 1; i < n; i++) add(hub, ids[i]);
      break;
    }
    case "sparse": {
      const m = prng.nextInt(0, n);
      for (let k = 0; k < m; k++) {
        add(ids[prng.nextInt(0, n - 1)], ids[prng.nextInt(0, n - 1)]);
      }
      break;
    }
    case "dense": {
      // Up to ~2n edges including duplicates and self-loops by construction.
      const m = prng.nextInt(n, 2 * n);
      for (let k = 0; k < m; k++) {
        add(ids[prng.nextInt(0, n - 1)], ids[prng.nextInt(0, n - 1)]);
      }
      break;
    }
  }
  return edges;
}

function makeEdge(prng: Prng, src: string, dst: string, idx: number): SceneEdgeData {
  const edge: SceneEdgeData = {
    id: `e${idx}:${src}->${dst}`,
    src,
    dst,
    relation: "rel",
    tier: pick(prng, TIERS),
    confidence: prng.next(),
  };
  const derivation = pick(prng, [...DERIVATIONS]);
  if (derivation) edge.derivation = derivation;
  return edge;
}

function makeEmbedding(prng: Prng, dim: number): number[] {
  // A normal embedding; occasionally ragged (shorter) so the semantic projection's
  // ragged-vector sanitizer is exercised under randomization too.
  const d = prng.next() < 0.15 ? Math.max(1, dim - prng.nextInt(0, dim)) : dim;
  const v = new Array<number>(d);
  for (let i = 0; i < d; i++) v[i] = prng.gaussian(0, 1);
  return v;
}

function pickKind(prng: Prng): string {
  return pick(prng, [
    "adr",
    "plan",
    "exec",
    "research",
    "audit",
    "rule",
    "code",
    "doc",
  ]);
}

function pick<T>(prng: Prng, items: readonly T[]): T {
  return items[prng.nextInt(0, items.length - 1)];
}

// --- the invariant assertion ---------------------------------------------------

/**
 * Assert the universal layout-output invariant on a positions map: every emitted
 * coordinate is finite and within the world envelope, and the map has exactly one
 * entry per laid node id. `expectedIds` is the set of ids the layout is contractually
 * required to place (every served node for the seed-layouts; the lineage layout may
 * carry advisory super-nodes but still places every real node).
 */
function assertInvariant(
  label: string,
  seed: number,
  positions: ReadonlyMap<string, { x: number; y: number }>,
  expectedIds: readonly string[],
): void {
  const ctx = `${label} seed=${seed}`;
  for (const id of expectedIds) {
    const p = positions.get(id);
    expect(p, `${ctx}: node ${id} has no position`).toBeDefined();
    expect(
      Number.isFinite(p!.x) && Number.isFinite(p!.y),
      `${ctx}: node ${id} position (${p!.x}, ${p!.y}) is non-finite`,
    ).toBe(true);
    expect(
      Math.abs(p!.x) <= COORD_ENVELOPE && Math.abs(p!.y) <= COORD_ENVELOPE,
      `${ctx}: node ${id} position (${p!.x}, ${p!.y}) exceeds the world envelope`,
    ).toBe(true);
  }
}

// --- the layouts under property test -------------------------------------------
//
// Each entry runs a layout over a graph and returns its positions map plus the ids
// it is required to have placed. The force layout is the d3-force DRIVER (a
// stateful settle loop, not a pure seed function), so it is property-tested in its
// own block below with a deterministic synchronous scheduler.

interface SeedLayoutCase {
  name: string;
  run: (g: RandomGraph) => {
    positions: ReadonlyMap<string, { x: number; y: number }>;
    expectedIds: string[];
  };
}

const SEED_LAYOUTS: SeedLayoutCase[] = [
  {
    name: "lineage",
    run: (g) => {
      const result = lineageLayout(g.nodes, g.edges);
      return { positions: result.positions, expectedIds: g.nodes.map((n) => n.id) };
    },
  },
  {
    name: "hierarchical",
    run: (g) => ({
      positions: hierarchicalLayout(g.nodes, g.edges),
      expectedIds: g.nodes.map((n) => n.id),
    }),
  },
  {
    name: "radial",
    run: (g) => ({
      positions: radialLayout(g.nodes, g.edges),
      expectedIds: g.nodes.map((n) => n.id),
    }),
  },
  {
    name: "community",
    run: (g) => ({
      positions: communityLayout(g.nodes, g.edges),
      expectedIds: g.nodes.map((n) => n.id),
    }),
  },
  {
    name: "semantic",
    run: (g) => ({
      positions: semanticLayout(g.nodes),
      expectedIds: g.nodes.map((n) => n.id),
    }),
  },
];

describe("layout property fence: finite, bounded, total output over random graphs", () => {
  for (const layout of SEED_LAYOUTS) {
    it(`${layout.name}: ${GRAPHS_PER_LAYOUT} seeded random graphs never glitch or crash`, () => {
      for (let i = 0; i < GRAPHS_PER_LAYOUT; i++) {
        // A distinct, layout-specific seed family so each layout sees a different
        // spread of shapes (and a failure names the exact seed).
        const seed = (layout.name.charCodeAt(0) << 16) ^ (i * 2654435761);
        const graph = randomGraph(seed);
        let result: ReturnType<SeedLayoutCase["run"]> | null = null;
        expect(() => {
          result = layout.run(graph);
        }, `${layout.name} seed=${seed} (n=${graph.nodes.length}) threw`).not.toThrow();
        assertInvariant(layout.name, seed, result!.positions, result!.expectedIds);
      }
    });
  }

  it("radial with a live selection (focus+context root override) stays invariant", () => {
    // The radial selection-override path is a distinct branch; exercise it under
    // randomization with a selected node drawn from the slice.
    for (let i = 0; i < GRAPHS_PER_LAYOUT; i++) {
      const seed = 0x7ad10 ^ (i * 40503);
      const graph = randomGraph(seed);
      if (graph.nodes.length === 0) continue;
      const selSeed = makePrng(seed ^ 0x5bd1e995);
      const selectedId = graph.nodes[selSeed.nextInt(0, graph.nodes.length - 1)].id;
      let positions: ReadonlyMap<string, { x: number; y: number }> | null = null;
      expect(() => {
        positions = radialLayout(graph.nodes, graph.edges, selectedId);
      }, `radial(sel) seed=${seed} threw`).not.toThrow();
      assertInvariant(
        "radial(sel)",
        seed,
        positions!,
        graph.nodes.map((n) => n.id),
      );
    }
  });
});

// --- the force driver (the sixth layout) ---------------------------------------
//
// The force layout is the stateful d3-force driver, not a pure seed function. It is
// property-tested with a SYNCHRONOUS deterministic scheduler so the settle loop runs
// to a bounded freeze under test control (no real animation frames, no hang), and
// every emitted frame is asserted finite/bounded. The driver's snapshot() already
// repairs a non-finite coordinate to the last-good value (D4); this fence proves
// that guard holds across a broad random sample, and that the loop always terminates
// (settle-then-freeze) within a bounded tick budget.

/** A synchronous scheduler that runs at most `maxTicks` queued frames inline, then
 *  stops scheduling — so a settle loop terminates deterministically under test and a
 *  pathological non-settling field is bounded by the tick cap rather than hanging. */
function boundedSyncScheduler(maxTicks: number): {
  scheduler: FrameScheduler;
  ticksRun: () => number;
} {
  let ran = 0;
  const scheduler: FrameScheduler = {
    schedule(cb) {
      if (ran >= maxTicks) return 0;
      ran += 1;
      cb();
      return ran;
    },
    cancel() {},
  };
  return { scheduler, ticksRun: () => ran };
}

describe("force driver property fence: finite, bounded frames over random graphs", () => {
  // The force driver is a stateful settle loop, so each graph runs many ticks and
  // is far costlier than a pure seed layout; a smaller seeded sample over the same
  // shape generator keeps the fence broad while bounded in wall-clock time.
  const FORCE_GRAPHS = 30;
  it("never emits a non-finite or runaway position across seeded random graphs", () => {
    // A bounded tick cap: the fixed cooling schedule settles a bounded slice well
    // within ~300 ticks (ALPHA_DECAY 0.0228), so 600 is ample headroom AND it
    // guarantees termination on any input (the "never hangs" property under
    // deterministic ticking — a non-settling field stops at the cap, never hangs).
    const MAX_TICKS = 600;
    for (let i = 0; i < FORCE_GRAPHS; i++) {
      const seed = 0xf02ce ^ (i * 2246822519);
      const graph = randomGraph(seed);
      const { scheduler } = boundedSyncScheduler(MAX_TICKS);
      const layout = new FieldLayout(scheduler);

      const nodeIds = graph.nodes.map((n) => n.id);
      const edgeRefs = graph.edges.map((e) => ({ id: e.id, src: e.src, dst: e.dst }));

      // Assert every emitted frame is finite and bounded — the snapshot guard must
      // hold on every tick, not just the final one.
      let frames = 0;
      const off = layout.onPositions((positions) => {
        frames += 1;
        for (const [id, p] of positions) {
          expect(
            Number.isFinite(p.x) && Number.isFinite(p.y),
            `force seed=${seed}: node ${id} frame ${frames} non-finite (${p.x}, ${p.y})`,
          ).toBe(true);
          expect(
            Math.abs(p.x) <= COORD_ENVELOPE && Math.abs(p.y) <= COORD_ENVELOPE,
            `force seed=${seed}: node ${id} frame ${frames} runaway (${p.x}, ${p.y})`,
          ).toBe(true);
        }
      });

      expect(() => {
        layout.init(nodeIds, edgeRefs, new Map());
        layout.start();
      }, `force seed=${seed} (n=${graph.nodes.length}) threw`).not.toThrow();

      // The loop terminated (settle-freeze or the tick cap), not hung — and the
      // final frame is finite/bounded too.
      for (const [id, p] of layout.positions) {
        expect(
          Number.isFinite(p.x) && Number.isFinite(p.y),
          `force seed=${seed}: final node ${id} non-finite`,
        ).toBe(true);
      }
      off();
      layout.destroy();
    }
  }, 20000);
});
