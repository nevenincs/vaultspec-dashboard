// Radial / tree layout (graph-layout-catalog ADR D1, D4, D5, D7; W02.P05).
//
// A deterministic-seed mode (D1): it returns a populated positions Map the
// assembly seeds the solver from and holds stopped — the worked circular/lineage
// pattern. No solver, no wire, no engine; pure CPU compute over the served slice
// (graph-compute-is-CPU), framework-free except for the ISC zero-dependency
// d3-hierarchy tidy-tree x-assignment (D4 — the one place a battle-tested
// zero-dep library cleanly beats a hand-roll).
//
// The pipeline (D4): pick a root → derive a BFS spanning tree over the
// splitBackbone().backbone adjacency (so radial distance reads as HOPS from the
// root, shortest-path) → d3.hierarchy over that tree → d3.tree().size([2π, R]) →
// polar-to-cartesian → positions Map.
//
// Root policy (D5, node-representation ADR D4): the default root is the
// highest-salience node in the slice, degree-max as the tie-break, then id for
// full determinism. When NO node in the slice carries salience (salience absent
// or zero across the whole slice — the feature-granularity case, where the engine
// serves salience at document granularity only), the policy falls back to the
// MAXIMUM-DEGREE node so the radial root is the most-connected hub rather than
// degenerating to the lowest-id node; degree-max with id as the final tie-break is
// the deterministic fallback. A selected node (if in the slice) OVERRIDES the
// policy in either case so radial reads as "hops from what I'm looking at".
// Disconnected components each get their own per-component root
// (highest local salience) laid out in SEPARATE ANGULAR SECTORS of one shared
// field — not separate concentric rings, so components stay co-visible without a
// false ring-distance between them. Sectors are allocated proportionally to each
// component's node count (an open-question resolution: size-weighted sectors keep
// a large component from being crushed into a thin wedge while a singleton hogs a
// quadrant), ordered deterministically by (root salience desc, root id).
//
// Determinism is a hard contract (mental-map preservation): every tie-break is by
// salience-then-id, the BFS visits neighbours in id order, so the same slice
// always yields the same positions.

import { hierarchy, tree } from "d3-hierarchy";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { splitBackbone } from "./backbone";

/** World-space radius of the outermost ring (the deepest tree layer of the
 *  largest component sits here). The per-component radius scales gently with
 *  component depth so a deep chain is not crushed. */
export const RADIAL_BASE_RADIUS = 520;
/** Minimum angular sector (radians) any non-empty component is allotted, so a
 *  singleton component still gets a legible wedge rather than a zero-width slot. */
export const RADIAL_MIN_SECTOR = Math.PI / 12;
/** Angular padding (radians) between adjacent component sectors, so the wedges
 *  read as distinct rather than abutting into one ring. */
export const RADIAL_SECTOR_PAD = Math.PI / 24;
/** Base radius at which a singleton component sits within its own sector. A lone
 *  node has no radial tree structure, so it is placed at its sector's
 *  representative point (mid-angle, this radius) rather than the shared field
 *  origin — otherwise every isolated singleton would pile at {0,0}. */
export const RADIAL_SINGLETON_RADIUS = RADIAL_BASE_RADIUS * 0.5;

/** A spanning-tree node: id plus the BFS-discovered children (id-sorted). */
interface TreeNode {
  id: string;
  children: TreeNode[];
}

/**
 * Lay the served slice out radially. `selectedId`, when present in the slice,
 * overrides the salience root policy for the component it belongs to (D5).
 * Pure: same inputs -> same positions.
 */
export function radialLayout(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
  selectedId?: string,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return out;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const salienceOf = new Map<string, number>();
  for (const n of nodes) salienceOf.set(n.id, n.salience ?? 0);

  // D4: detect whether the slice carries any salience at all. At feature
  // granularity the engine serves salience at document granularity only, so every
  // node arrives salience-absent (undefined) or zero; in that case the root policy
  // falls back to the maximum-degree node (the most-connected hub) instead of
  // selecting an arbitrary low-id node. A single node with real salience anywhere
  // in the slice keeps the salience-first policy.
  const hasSalience = nodes.some((n) => (n.salience ?? 0) > 0);

  // D7: radial extracts its BFS tree over the layout BACKBONE adjacency (declared
  // + structural), the same anti-hairball subset the connectivity solver is fed —
  // never the noisy temporal/semantic context.
  const { backbone } = splitBackbone(edges);
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  const degreeOf = new Map<string, number>();
  for (const id of nodeIds) degreeOf.set(id, 0);
  for (const e of backbone) {
    if (!nodeIds.has(e.src) || !nodeIds.has(e.dst) || e.src === e.dst) continue;
    adj.get(e.src)!.push(e.dst);
    adj.get(e.dst)!.push(e.src);
    degreeOf.set(e.src, (degreeOf.get(e.src) ?? 0) + 1);
    degreeOf.set(e.dst, (degreeOf.get(e.dst) ?? 0) + 1);
  }
  // Deterministic neighbour order: id-sorted, deduplicated (parallel backbone
  // edges between the same pair must not double-list a child).
  for (const [id, list] of adj) {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const nb of list.slice().sort()) {
      if (!seen.has(nb)) {
        seen.add(nb);
        deduped.push(nb);
      }
    }
    adj.set(id, deduped);
  }

  // Discover connected components by BFS over the undirected backbone adjacency.
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of [...nodeIds].sort()) {
    if (visited.has(id)) continue;
    const comp: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    components.push(comp);
  }

  // Per-component root (D5 / D4): when the slice carries salience, the root is
  // salience-max with degree-max as the tie-break; when no node carries salience
  // (feature granularity), the policy falls back to degree-max directly so the
  // most-connected hub anchors the component. Id is the final deterministic
  // tie-break in both cases. A selected node overrides for its own component.
  const rootOf = (comp: string[]): string => {
    const set = new Set(comp);
    if (selectedId && set.has(selectedId)) return selectedId;
    return comp.slice().sort((a, b) => {
      if (hasSalience) {
        const sa = salienceOf.get(a) ?? 0;
        const sb = salienceOf.get(b) ?? 0;
        if (sa !== sb) return sb - sa; // salience desc
      }
      const da = degreeOf.get(a) ?? 0;
      const db = degreeOf.get(b) ?? 0;
      if (da !== db) return db - da; // degree desc (the max-degree fallback)
      return a.localeCompare(b); // id asc
    })[0];
  };

  // Order components for sector allocation deterministically so the most important
  // component anchors the first sector: by (root salience desc, root id) when the
  // slice carries salience, falling back to (root degree desc, root id) when it
  // does not (D4) so the most-connected component still anchors first.
  const componentEntries = components.map((comp) => ({
    comp,
    root: rootOf(comp),
  }));
  componentEntries.sort((x, y) => {
    if (hasSalience) {
      const sx = salienceOf.get(x.root) ?? 0;
      const sy = salienceOf.get(y.root) ?? 0;
      if (sx !== sy) return sy - sx;
    } else {
      const dx = degreeOf.get(x.root) ?? 0;
      const dy = degreeOf.get(y.root) ?? 0;
      if (dx !== dy) return dy - dx;
    }
    return x.root.localeCompare(y.root);
  });

  // Size-weighted sector allocation (open question resolution): each component's
  // angular share is proportional to its node count, floored at RADIAL_MIN_SECTOR
  // and separated by RADIAL_SECTOR_PAD, so a large component is never crushed and
  // a singleton still gets a legible wedge.
  const total = nodes.length;
  const padTotal = RADIAL_SECTOR_PAD * componentEntries.length;
  const usable = Math.max(0, 2 * Math.PI - padTotal);
  // Raw proportional shares, then lift any below the floor and renormalise the
  // rest so the whole circle is exactly consumed.
  const rawShare = componentEntries.map((e) => (usable * e.comp.length) / total);
  const flooredShare = rawShare.map((s) => Math.max(RADIAL_MIN_SECTOR, s));
  const flooredSum = flooredShare.reduce((a, b) => a + b, 0);
  const scale = flooredSum > 0 ? usable / flooredSum : 1;
  const sectorOf = flooredShare.map((s) => s * scale);

  let cursor = 0;
  componentEntries.forEach((entry, ci) => {
    const sector = sectorOf[ci];
    const sectorStart = cursor + RADIAL_SECTOR_PAD / 2;
    cursor += sector + RADIAL_SECTOR_PAD;
    placeComponent(entry.comp, entry.root, adj, sectorStart, sector, out);
  });

  return out;
}

/**
 * Place one component's BFS spanning tree into a single angular sector. The tree
 * is laid out with d3.tree().size([sectorWidth, R]) where the first axis is the
 * angle within the sector and the second is the radius; polar -> cartesian gives
 * world coordinates. A single-node component has no radial tree structure, so it
 * is placed at its sector's REPRESENTATIVE POINT — the sector mid-angle at a small
 * base radius — not the shared field origin, so multiple isolated singletons each
 * occupy their own allotted wedge instead of piling up at {0,0}.
 */
function placeComponent(
  comp: readonly string[],
  rootId: string,
  adj: Map<string, string[]>,
  sectorStart: number,
  sectorWidth: number,
  out: Map<string, { x: number; y: number }>,
): void {
  if (comp.length === 1) {
    // Sector mid-angle (matching the `- π/2` top-start convention of the tree
    // branch below) at the singleton radius: each singleton's distinct sector
    // yields a distinct position, never the shared origin.
    const angle = sectorStart + sectorWidth / 2 - Math.PI / 2;
    out.set(comp[0], {
      x: Math.cos(angle) * RADIAL_SINGLETON_RADIUS,
      y: Math.sin(angle) * RADIAL_SINGLETON_RADIUS,
    });
    return;
  }

  // BFS spanning tree from the root (D4): each node's tree parent is its FIRST
  // BFS discoverer, so tree depth = shortest-path hops from the root. Neighbour
  // order is already id-sorted, so the tree is deterministic.
  const compSet = new Set(comp);
  const treeChildren = new Map<string, string[]>();
  for (const id of comp) treeChildren.set(id, []);
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  let maxDepth = 0;
  const depthOf = new Map<string, number>([[rootId, 0]]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = depthOf.get(cur) ?? 0;
    for (const nb of adj.get(cur) ?? []) {
      if (!compSet.has(nb) || seen.has(nb)) continue;
      seen.add(nb);
      treeChildren.get(cur)!.push(nb);
      depthOf.set(nb, d + 1);
      maxDepth = Math.max(maxDepth, d + 1);
      queue.push(nb);
    }
  }

  const build = (id: string): TreeNode => ({
    id,
    children: (treeChildren.get(id) ?? []).map(build),
  });
  const root = hierarchy<TreeNode>(build(rootId), (d) => d.children);

  // d3.tree lays [x ∈ sectorWidth, y ∈ R]; x is the angle within the sector and
  // y the radius. The radius scales with this component's depth so a shallow
  // component does not sprawl across the whole field nor a deep one overlap.
  const radius = RADIAL_BASE_RADIUS * (maxDepth > 0 ? 1 : 0.001);
  const layout = tree<TreeNode>().size([sectorWidth, radius]);
  const laid = layout(root);

  laid.each((node) => {
    const angle = sectorStart + node.x - Math.PI / 2; // start sectors at the top
    const r = node.y;
    out.set(node.data.id, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  });
}
