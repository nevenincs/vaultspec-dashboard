// Shared layered-DAG (Sugiyama) primitives (graph-lineage-dag ADR D1, W03.P10).
//
// Pure, framework-free, deterministic graph-id algorithms reusable by any
// layered layout: lineage's derivation DAG today (lineageLayout.ts), and the
// layout catalog's hierarchical Sugiyama mode (W02.P06) tomorrow. The open
// question "extract longest-path into a shared helper or duplicate" is settled
// here in favour of EXTRACTION (W03.P10.S40 decision): the full Sugiyama
// pipeline is substantial enough — cycle removal, dummy-node layering, median
// crossing reduction, coordinate assignment — that one tested implementation
// serves both layered modes. lineageLayout owns only the lineage-specific
// policy (off-spine placement, index suppression, aggregate-LOD); the generic
// layering math lives here.
//
// Everything operates on opaque string node ids and directed (parent -> child)
// edges. Determinism is a hard contract (mental-map preservation,
// graph-compute-is-CPU): every tie-break is by id, the sweep count is fixed, so
// same inputs -> same layered structure -> same positions.

/** One directed layering edge: `from` derives `to` (parent -> child). */
export interface LayeredEdge {
  from: string;
  to: string;
}

/** A dummy waypoint node inserted on an edge that spans more than one layer. */
export interface DummyNode {
  /** Synthetic id, unique and stable: `__dummy:{edgeKey}:{layer}`. */
  id: string;
  layer: number;
}

/**
 * A routed edge after dummy insertion: the original endpoints plus the ordered
 * chain of dummy waypoint ids it passes through (empty for a unit-length edge).
 * The chain runs from the `from` layer to the `to` layer in true direction,
 * already restored from any cycle-removal reversal (D1.1).
 */
export interface RoutedEdge {
  from: string;
  to: string;
  /** Dummy waypoint ids in order from `from` toward `to`. */
  waypoints: string[];
}

/** The full layered structure a coordinate pass turns into positions. */
export interface LayeredGraph {
  /** layer index -> ordered real+dummy node ids (post crossing-reduction). */
  layers: string[][];
  /** node id (real or dummy) -> its layer index. */
  layerOf: Map<string, number>;
  /** node id (real or dummy) -> its position within its layer (0-based). */
  orderInLayer: Map<string, number>;
  /** Real edges routed through their dummy chains, true direction. */
  routed: RoutedEdge[];
  /** The dummy waypoint ids minted during layering. */
  dummies: Set<string>;
}

/** Fixed crossing-reduction sweep count (D1.3/D1.5): a bounded, deterministic
 *  number of up/down median passes — never input-dependent, so the layout is
 *  reproducible. */
export const CROSSING_SWEEPS = 8;

/**
 * Deterministic DFS cycle removal by back-edge reversal (D1.1). Returns the edge
 * set as a DAG — every detected back-edge (an edge to a node currently on the
 * DFS stack) is REVERSED rather than dropped, so its contribution to layering
 * survives; the reversal set is returned so the caller can restore true
 * direction for routing/draw. DFS roots and adjacency are id-sorted so the
 * outcome is identical across re-runs.
 */
export function removeCycles(
  nodeIds: readonly string[],
  edges: readonly LayeredEdge[],
): { dag: LayeredEdge[]; reversed: Set<string> } {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
  }
  for (const list of adj.values()) list.sort();

  const edgeKey = (from: string, to: string) => `${from} ${to}`;
  const reversed = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on-stack, 2 done
  const roots = [...adj.keys()].sort();

  // Iterative DFS (corpus DAGs can be deep; recursion risks stack overflow).
  for (const root of roots) {
    if (state.get(root)) continue;
    const stack: { id: string; childIdx: number }[] = [{ id: root, childIdx: 0 }];
    state.set(root, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const children = adj.get(frame.id) ?? [];
      if (frame.childIdx >= children.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const child = children[frame.childIdx++];
      const s = state.get(child) ?? 0;
      if (s === 1) {
        // Back-edge: reverse it (record the original direction key).
        reversed.add(edgeKey(frame.id, child));
      } else if (s === 0) {
        state.set(child, 1);
        stack.push({ id: child, childIdx: 0 });
      }
    }
  }

  const dag: LayeredEdge[] = edges.map((e) =>
    reversed.has(edgeKey(e.from, e.to))
      ? { from: e.to, to: e.from }
      : { from: e.from, to: e.to },
  );
  return { dag, reversed };
}

/**
 * Longest-path layer assignment (D1.2): a node's layer is one more than the max
 * layer of any node it derives FROM. Roots (no in-edges in the DAG) sit at
 * layer 0. Deterministic and cycle-safe over the already-acyclic `dag`. The
 * `seedLayer` callback supplies a floor layer for a node whose only parent is
 * absent from the slice (a dangling stub seeded by axis order), so the stub
 * still lands in a sensible column without a fabricated edge.
 */
export function assignLayers(
  nodeIds: readonly string[],
  dag: readonly LayeredEdge[],
  seedLayer?: (id: string) => number,
): Map<string, number> {
  const present = new Set(nodeIds);
  const parentsOf = new Map<string, string[]>();
  for (const id of nodeIds) parentsOf.set(id, []);
  for (const e of dag) {
    if (present.has(e.to)) {
      const list = parentsOf.get(e.to) ?? [];
      list.push(e.from);
      parentsOf.set(e.to, list);
    }
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const layer = (id: string): number => {
    const m = memo.get(id);
    if (m !== undefined) return m;
    if (visiting.has(id)) return 0; // belt-and-braces guard (DAG already acyclic)
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    // A PRESENT parent pins the depth to layer(parent) + 1 (the longest-path
    // rule); the axis-order seed is only a FLOOR for a node with no present
    // parent (a root, or a dangling stub whose parent is absent from the slice),
    // so a real parent edge always wins over the seed.
    let depth = 0;
    let hasPresentParent = false;
    for (const p of parents) {
      if (present.has(p)) {
        hasPresentParent = true;
        depth = Math.max(depth, layer(p) + 1);
      }
    }
    if (!hasPresentParent && seedLayer) {
      depth = Math.max(depth, seedLayer(id));
    }
    visiting.delete(id);
    memo.set(id, depth);
    return depth;
  };

  const out = new Map<string, number>();
  for (const id of [...nodeIds].sort()) out.set(id, layer(id));
  return out;
}

/**
 * Insert dummy nodes on every edge spanning more than one layer (D1.2) so every
 * edge becomes a chain of unit-length segments — the prerequisite for routed
 * polyline draw (D6). Returns the per-layer node-id buckets (real + dummy), the
 * layer maps, and the routed edges (each carrying its dummy chain in true
 * direction). `reversed` edges (from cycle removal) are restored to their
 * original direction here so routing draws the real arrow direction.
 */
export function insertDummies(
  layerOf: Map<string, number>,
  dag: readonly LayeredEdge[],
  reversed: ReadonlySet<string>,
): {
  layers: string[][];
  dummies: Set<string>;
  routed: RoutedEdge[];
  dummyLayerOf: Map<string, number>;
} {
  const dummies = new Set<string>();
  const dummyLayerOf = new Map<string, number>(layerOf);
  const routed: RoutedEdge[] = [];
  const edgeKey = (from: string, to: string) => `${from} ${to}`;

  // Process edges in a deterministic order so dummy ids are reproducible.
  const ordered = [...dag].sort((a, b) =>
    a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
  );

  for (const e of ordered) {
    const lf = layerOf.get(e.from);
    const lt = layerOf.get(e.to);
    if (lf === undefined || lt === undefined) continue;
    // True direction (restore a reversal): cycle removal may have flipped this
    // edge to keep the DAG acyclic; the routed edge draws the ORIGINAL arrow.
    const wasReversed = reversed.has(edgeKey(e.to, e.from));
    const trueFrom = wasReversed ? e.to : e.from;
    const trueTo = wasReversed ? e.from : e.to;
    const lowLayer = Math.min(lf, lt);
    const highLayer = Math.max(lf, lt);
    const span = highLayer - lowLayer;
    const waypoints: string[] = [];
    if (span > 1) {
      // One dummy per intermediate layer, keyed deterministically on the edge.
      const key = edgeKey(e.from, e.to);
      for (let layer = lowLayer + 1; layer < highLayer; layer++) {
        const id = `__dummy:${key}:${layer}`;
        dummies.add(id);
        dummyLayerOf.set(id, layer);
        waypoints.push(id);
      }
    }
    // Order waypoints from trueFrom's layer toward trueTo's layer.
    const fromLayer = dummyLayerOf.get(trueFrom) ?? lf;
    const toLayer = dummyLayerOf.get(trueTo) ?? lt;
    if (fromLayer > toLayer) waypoints.reverse();
    routed.push({ from: trueFrom, to: trueTo, waypoints });
  }

  // Bucket every real + dummy node into its layer.
  const maxLayer = Math.max(0, ...[...dummyLayerOf.values()]);
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const [id, layer] of dummyLayerOf) layers[layer].push(id);
  for (const bucket of layers) bucket.sort();

  return { layers, dummies, routed, dummyLayerOf };
}

/**
 * Median/barycenter crossing reduction (D1.3): a fixed number of up-then-down
 * sweeps reorder each layer by the median position of each node's neighbours in
 * the adjacent fixed layer, replacing the lexical sort. Nodes with no neighbour
 * in the reference layer keep their current relative order (stable). Ties break
 * by id so the result is deterministic. Operates over the combined real+dummy
 * adjacency built from the routed chains.
 */
export function reduceCrossings(
  layers: string[][],
  routed: readonly RoutedEdge[],
  sweeps = CROSSING_SWEEPS,
): void {
  // Build adjacency over the dummy-expanded chain: each routed edge is a path
  // trueFrom -> w0 -> w1 -> ... -> trueTo; every consecutive pair is an edge.
  const up = new Map<string, string[]>(); // node -> neighbours one layer ABOVE
  const down = new Map<string, string[]>(); // node -> neighbours one layer BELOW
  const link = (a: string, b: string) => {
    // a is on the lower-index layer, b on the higher-index layer.
    (down.get(a) ?? down.set(a, []).get(a)!).push(b);
    (up.get(b) ?? up.set(b, []).get(b)!).push(a);
  };
  const layerIndex = new Map<string, number>();
  layers.forEach((bucket, i) => bucket.forEach((id) => layerIndex.set(id, i)));
  for (const e of routed) {
    const chain = [e.from, ...e.waypoints, e.to];
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      const la = layerIndex.get(a);
      const lb = layerIndex.get(b);
      if (la === undefined || lb === undefined) continue;
      if (la < lb) link(a, b);
      else if (lb < la) link(b, a);
    }
  }

  const median = (
    id: string,
    refOrder: Map<string, number>,
    neighbours: Map<string, string[]>,
  ): number => {
    const ns = (neighbours.get(id) ?? [])
      .map((n) => refOrder.get(n))
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b);
    if (ns.length === 0) return -1; // no anchor: keep current order (sentinel)
    const mid = Math.floor(ns.length / 2);
    return ns.length % 2 === 1 ? ns[mid] : (ns[mid - 1] + ns[mid]) / 2;
  };

  const reorder = (
    bucket: string[],
    refOrder: Map<string, number>,
    neighbours: Map<string, string[]>,
  ) => {
    const keyed = bucket.map((id, i) => ({
      id,
      i,
      m: median(id, refOrder, neighbours),
    }));
    // Nodes with no anchor (m === -1) keep their original index; anchored nodes
    // sort by median, ties by id (determinism).
    keyed.sort((a, b) => {
      const am = a.m === -1 ? a.i : a.m;
      const bm = b.m === -1 ? b.i : b.m;
      if (am !== bm) return am - bm;
      return a.id.localeCompare(b.id);
    });
    bucket.splice(0, bucket.length, ...keyed.map((k) => k.id));
  };

  const orderMap = (bucket: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    bucket.forEach((id, i) => m.set(id, i));
    return m;
  };

  for (let sweep = 0; sweep < sweeps; sweep++) {
    if (sweep % 2 === 0) {
      // Down sweep: order each layer by its neighbours in the layer above.
      for (let i = 1; i < layers.length; i++) {
        reorder(layers[i], orderMap(layers[i - 1]), up);
      }
    } else {
      // Up sweep: order each layer by its neighbours in the layer below.
      for (let i = layers.length - 2; i >= 0; i--) {
        reorder(layers[i], orderMap(layers[i + 1]), down);
      }
    }
  }
}

/**
 * Median-alignment within-layer coordinate assignment (D1.4). Brandes-Köpf is
 * the textbook choice; for the bounded lineage slice the simpler median
 * alignment the ADR names as the acceptable fallback is used: each node takes a
 * cross-axis coordinate that is the median of its neighbours' coordinates,
 * iterated a fixed number of times from an even baseline spread, then nudged to
 * remove overlaps within a layer. Deterministic (fixed iterations, id
 * tie-breaks). Returns the per-node order-index already in `orderInLayer`; the
 * caller maps (layer, cross-coordinate) to world (x, y).
 */
export function assignCoordinates(
  layers: string[][],
  routed: readonly RoutedEdge[],
  iterations = 4,
): { crossOf: Map<string, number>; orderInLayer: Map<string, number> } {
  const orderInLayer = new Map<string, number>();
  for (const bucket of layers) bucket.forEach((id, i) => orderInLayer.set(id, i));

  // Baseline: even integer spread centred on 0 within each layer.
  const crossOf = new Map<string, number>();
  for (const bucket of layers) {
    const offset = (bucket.length - 1) / 2;
    bucket.forEach((id, i) => crossOf.set(id, i - offset));
  }

  const layerIndex = new Map<string, number>();
  layers.forEach((bucket, i) => bucket.forEach((id) => layerIndex.set(id, i)));
  const neighbours = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    (neighbours.get(a) ?? neighbours.set(a, []).get(a)!).push(b);
    (neighbours.get(b) ?? neighbours.set(b, []).get(b)!).push(a);
  };
  for (const e of routed) {
    const chain = [e.from, ...e.waypoints, e.to];
    for (let i = 0; i + 1 < chain.length; i++) add(chain[i], chain[i + 1]);
  }

  for (let iter = 0; iter < iterations; iter++) {
    for (const bucket of layers) {
      // Desired cross-coordinate = median of neighbour cross-coordinates.
      const desired = new Map<string, number>();
      for (const id of bucket) {
        const ns = (neighbours.get(id) ?? [])
          .map((n) => crossOf.get(n))
          .filter((v): v is number => v !== undefined)
          .sort((a, b) => a - b);
        if (ns.length === 0) {
          desired.set(id, crossOf.get(id) ?? 0);
        } else {
          const mid = Math.floor(ns.length / 2);
          desired.set(id, ns.length % 2 === 1 ? ns[mid] : (ns[mid - 1] + ns[mid]) / 2);
        }
      }
      // Apply desired then enforce minimum unit separation in order, so nodes in
      // one layer never collide (monotonic non-decreasing by order index).
      let prev = -Infinity;
      for (const id of bucket) {
        let v = desired.get(id) ?? 0;
        if (v <= prev) v = prev + 1;
        crossOf.set(id, v);
        prev = v;
      }
    }
  }

  return { crossOf, orderInLayer };
}

/**
 * Run the full Sugiyama pipeline (D1) over directed parent -> child edges,
 * returning the layered structure plus per-node cross-coordinate. Composes the
 * five phases: cycle removal, layer assignment, dummy insertion, crossing
 * reduction, coordinate assignment. Pure and deterministic.
 */
export function layeredLayout(
  nodeIds: readonly string[],
  edges: readonly LayeredEdge[],
  seedLayer?: (id: string) => number,
): LayeredGraph & { crossOf: Map<string, number> } {
  const { dag, reversed } = removeCycles(nodeIds, edges);
  const layerOf = assignLayers(nodeIds, dag, seedLayer);
  const { layers, dummies, routed } = insertDummies(layerOf, dag, reversed);
  reduceCrossings(layers, routed);
  const { crossOf, orderInLayer } = assignCoordinates(layers, routed);

  const fullLayerOf = new Map<string, number>();
  layers.forEach((bucket, i) => bucket.forEach((id) => fullLayerOf.set(id, i)));

  return { layers, layerOf: fullLayerOf, orderInLayer, routed, dummies, crossOf };
}
