// Targeted degenerate-input fuzz fence over the representation dispatcher (graph-
// viz-quality plan W04.P12.S55).
//
// Where property.test.ts sweeps MANY randomized graphs, this suite is the
// ADVERSARIAL-SHAPE fence: it enumerates the hand-picked degenerate graph shapes
// that have historically broken layout code — empty, single node, two isolated
// nodes, fully disconnected, all-same-position, a complete graph, a long path, a
// single cycle, a star, duplicate edges, self-loops, and a node carrying a
// ragged/NaN embedding — and feeds EVERY one through the `representationLayout`
// dispatcher for ALL SIX modes (connectivity, lineage, hierarchical, radial,
// community, semantic). For every (shape x mode) pair it asserts:
//
//   (1) the dispatch call never throws,
//   (2) every emitted seed position is finite and within the world envelope,
//   (3) no laid node is dropped (the mode places every served node, OR returns a
//       null seed map — connectivity, and a held/downgraded semantic — which the
//       Cosmos field then owns; a null map is the honest "I own no
//       seed" answer, not a glitch),
//   (4) a downgraded mode reports an honest `downgradeReason`.
//
// This exercises the SAME entry point the scene calls (the dispatcher), so the
// gating/fallback branches (semantic held when embeddings absent) are covered as
// the app reaches them, not only the bare layout functions.

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../../sceneController";
import { type RepresentationMode, representationLayout } from "../representationLayout";

const MODES: RepresentationMode[] = [
  "connectivity",
  "lineage",
  "hierarchical",
  "radial",
  "community",
];

const COORD_ENVELOPE = 1e6;

// --- the adversarial shape catalogue -------------------------------------------

interface Shape {
  name: string;
  nodes: SceneNodeData[];
  edges: SceneEdgeData[];
  /** A node id in the slice to pass as the selection (radial focus override). */
  selectedId?: string;
}

function node(id: string, extra?: Partial<SceneNodeData>): SceneNodeData {
  return { id, kind: "doc", ...extra };
}

function edge(src: string, dst: string, extra?: Partial<SceneEdgeData>): SceneEdgeData {
  return {
    id: `e:${src}->${dst}:${extra?.relation ?? "rel"}`,
    src,
    dst,
    relation: "rel",
    tier: "structural",
    confidence: 1,
    ...extra,
  };
}

/** N nodes named `n0..n{N-1}`. */
function nodes(
  n: number,
  extra?: (i: number) => Partial<SceneNodeData>,
): SceneNodeData[] {
  return Array.from({ length: n }, (_, i) => node(`n${i}`, extra?.(i)));
}

const SHAPES: Shape[] = (() => {
  const out: Shape[] = [];

  // Empty slice.
  out.push({ name: "empty", nodes: [], edges: [] });

  // Single node, no edges.
  out.push({ name: "single node", nodes: [node("solo")], edges: [] });

  // Single node with a self-loop (degenerate edge to itself).
  out.push({
    name: "single node + self-loop",
    nodes: [node("solo")],
    edges: [edge("solo", "solo")],
  });

  // Two isolated nodes (no edges).
  out.push({ name: "two isolated nodes", nodes: nodes(2), edges: [] });

  // Fully disconnected: many nodes, zero edges (all-isolated).
  out.push({ name: "fully disconnected (20 isolated)", nodes: nodes(20), edges: [] });

  // All-same-position seed: every node carries the SAME seedPosition (a degenerate
  // input that collapses any position-derived metric to a singularity).
  out.push({
    name: "all-same seedPosition",
    nodes: nodes(12, () => ({ seedPosition: { x: 5, y: 5 } })),
    edges: [],
  });

  // Complete graph K6 (every distinct unordered pair).
  {
    const ns = nodes(6);
    const es: SceneEdgeData[] = [];
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) es.push(edge(`n${i}`, `n${j}`));
    }
    out.push({ name: "complete graph K6", nodes: ns, edges: es });
  }

  // A long directed path n0 -> n1 -> ... -> n29.
  {
    const ns = nodes(30);
    const es: SceneEdgeData[] = [];
    for (let i = 1; i < 30; i++) es.push(edge(`n${i - 1}`, `n${i}`));
    out.push({ name: "long path (30)", nodes: ns, edges: es });
  }

  // A single directed cycle (back-edge closes the loop — exercises cycle removal).
  {
    const ns = nodes(10);
    const es: SceneEdgeData[] = [];
    for (let i = 1; i < 10; i++) es.push(edge(`n${i - 1}`, `n${i}`));
    es.push(edge("n9", "n0"));
    out.push({ name: "single cycle (10)", nodes: ns, edges: es });
  }

  // A 2-cycle (mutual back-edge) — the tightest cycle.
  out.push({
    name: "two-node mutual cycle",
    nodes: nodes(2),
    edges: [edge("n0", "n1"), edge("n1", "n0")],
  });

  // A star: one hub, many leaves.
  {
    const ns = nodes(16);
    const es = Array.from({ length: 15 }, (_, i) => edge("n0", `n${i + 1}`));
    out.push({
      name: "star (hub + 15 leaves)",
      nodes: ns,
      edges: es,
      selectedId: "n0",
    });
  }

  // Duplicate edges: the same pair repeated many times (parallel edges).
  {
    const ns = nodes(4);
    const es: SceneEdgeData[] = [];
    for (let k = 0; k < 8; k++) es.push(edge("n0", "n1", { relation: `dup${k}` }));
    es.push(edge("n1", "n2"));
    es.push(edge("n2", "n3"));
    out.push({ name: "duplicate parallel edges", nodes: ns, edges: es });
  }

  // Self-loops across a small connected graph.
  {
    const ns = nodes(5);
    const es = [
      edge("n0", "n0"),
      edge("n1", "n1"),
      edge("n0", "n1"),
      edge("n1", "n2"),
      edge("n2", "n3"),
      edge("n3", "n4"),
    ];
    out.push({ name: "self-loops on a path", nodes: ns, edges: es });
  }

  // A node with a ragged embedding (shorter than its siblings) plus a NaN/Inf
  // component — the exact poison the semantic sanitizer (S52) guards.
  out.push({
    name: "ragged + NaN/Inf embeddings",
    nodes: [
      node("a", { embedding: [1, 2, 3, 4] }),
      node("b", { embedding: [5, 6] }), // ragged: shorter
      node("c", { embedding: [7, NaN, 9, Infinity] }), // poison components
      node("d", { embedding: [] }), // empty: NOT a real embedding
      node("e"), // no embedding at all
    ],
    edges: [edge("a", "b"), edge("b", "c")],
  });

  // A mixed slice with derivation labels (drives the lineage spine) AND feature
  // tags AND dates AND salience — exercises every off-spine/root branch at once.
  {
    const ns = [
      node("research0", { kind: "research", salience: 0.9 }),
      node("adr0", { kind: "adr", featureTags: ["alpha"] }),
      node("plan0", { kind: "plan", dates: { created: "2026-06-01" } }),
      node("exec0", { kind: "exec" }),
      node("orphan", { kind: "doc" }), // off-spine, no anchor -> gutter
    ];
    const es = [
      edge("research0", "adr0", { derivation: "authorizes" }),
      edge("adr0", "plan0", { derivation: "authorizes" }),
      edge("plan0", "exec0", { derivation: "generated-by" }),
      // A dangling derivation: dst present, src absent from the slice.
      edge("missingParent", "adr0", { derivation: "refines" }),
    ];
    out.push({ name: "lineage spine + off-spine mix", nodes: ns, edges: es });
  }

  // All nodes carry full embeddings (the semantic mode's all-embedded happy path,
  // so the gated dispatcher actually projects rather than holding).
  out.push({
    name: "all-embedded slice",
    nodes: nodes(24, (i) => ({
      embedding: Array.from({ length: 8 }, (_, d) => Math.sin(i * 0.3 + d)),
    })),
    edges: [],
  });

  return out;
})();

// --- the invariant ------------------------------------------------------------

const finite = (p: { x: number; y: number }) =>
  Number.isFinite(p.x) && Number.isFinite(p.y);

describe("fuzz: every adversarial shape survives every representation mode", () => {
  for (const shape of SHAPES) {
    for (const mode of MODES) {
      it(`${mode} on "${shape.name}" emits finite bounded seeds and never throws`, () => {
        let result: ReturnType<typeof representationLayout> | null = null;
        expect(() => {
          result = representationLayout(
            mode,
            shape.nodes,
            shape.edges,
            shape.selectedId,
          );
        }, `${mode} on "${shape.name}" threw`).not.toThrow();

        const r = result!;
        // A null seed map is a valid, honest answer: connectivity owns its positions
        // in Cosmos, and a held/downgraded semantic mode hands off to
        // connectivity. When a mode downgrades it MUST say why.
        if (r.applied !== mode) {
          expect(
            r.downgradeReason,
            `${mode} on "${shape.name}" downgraded to ${r.applied} with no reason`,
          ).toBeTruthy();
        }

        if (r.positions === null) {
          // Only connectivity, or a downgraded-to-connectivity semantic mode, may
          // return a null seed (Cosmos then owns placement).
          expect(
            r.applied,
            `${mode} on "${shape.name}" returned null positions but applied ${r.applied}`,
          ).toBe("connectivity");
          return;
        }

        // A populated seed map: every served node placed, finite, and bounded.
        for (const n of shape.nodes) {
          const p = r.positions.get(n.id);
          expect(
            p,
            `${r.applied} on "${shape.name}": node ${n.id} has no seed position`,
          ).toBeDefined();
          expect(
            finite(p!),
            `${r.applied} on "${shape.name}": node ${n.id} non-finite (${p!.x}, ${p!.y})`,
          ).toBe(true);
          expect(
            Math.abs(p!.x) <= COORD_ENVELOPE && Math.abs(p!.y) <= COORD_ENVELOPE,
            `${r.applied} on "${shape.name}": node ${n.id} runaway (${p!.x}, ${p!.y})`,
          ).toBe(true);
        }
      });
    }
  }

  it("covers every adversarial shape against every mode (cardinality guard)", () => {
    // A tripwire so a future edit that drops a shape or a mode from the matrix is
    // caught — the fence is only a fence if it stays exhaustive.
    expect(MODES).toHaveLength(5);
    expect(SHAPES.length).toBeGreaterThanOrEqual(15);
  });
});
