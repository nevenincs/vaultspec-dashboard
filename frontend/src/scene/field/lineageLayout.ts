// Lineage derivation-DAG layout (graph-representation ADR, W02.P05).
//
// The lineage mode lays the directed derivation DAG along a derivation/time axis
// (the CitNetExplorer / W3C PROV convention): research -> adr -> plan -> exec ->
// audit -> rule flow left-to-right, so a reviewer traces decision-to-execution
// provenance by path-following (the one task at which node-link decisively beats
// matrices). It consumes the `derivation` edge labels (graph-node-semantics); it
// needs no new wire data.
//
// This is CPU compute (graph-compute-is-CPU): a pure layering function over the
// served nodes and their derivation edges, producing world positions the GPU then
// draws. The engine holds no coordinates.
//
// Honest degradation (the ADR's stance): an incomplete derivation chain — an
// orphan exec record, or a plan whose ADR is absent — renders as a DANGLING
// lineage stub at the axis position its own derivation depth implies, never a
// fabricated edge. A node with NO derivation edge at all (a pure semantic
// neighbor, a code artifact) is placed in a holding lane to the side, marked so
// the renderer can draw it as not-on-the-spine.

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { DERIVATION_AXIS_ORDER, isLineageEdge } from "./edgeMeshes";

export interface LineagePosition {
  x: number;
  y: number;
  /** The derivation-axis depth (0 = source of the chain). */
  depth: number;
  /**
   * True when the node sits on the derivation spine (has at least one incident
   * derivation edge); false when it is a holding-lane node with no lineage edge.
   * The renderer draws holding-lane nodes faded/aside so an absent chain reads
   * as honestly incomplete, never as a fabricated lineage member.
   */
  onSpine: boolean;
  /**
   * True when the node's incoming derivation chain is incomplete (the parent it
   * derives from is not in the served slice) — a dangling lineage stub. Drawn
   * with a dangling marker, never with a fabricated edge to a missing parent.
   */
  dangling: boolean;
}

/** Horizontal spacing between derivation-axis columns (world units). */
export const LINEAGE_COL_SPACING = 220;
/** Vertical spacing between nodes within one axis column. */
export const LINEAGE_ROW_SPACING = 60;
/** X offset of the holding lane (nodes with no derivation edge), to the left. */
export const LINEAGE_HOLDING_X = -LINEAGE_COL_SPACING;

/**
 * Lay the served nodes along the derivation axis. Pure: same inputs -> same
 * positions, deterministic ordering, no side effects.
 *
 * Depth is the longest-path depth along the derivation DAG: a node's depth is one
 * more than the max depth of any node it derives FROM (its derivation parents).
 * The derivation direction is src -> dst with the label naming the relation; the
 * axis order (`DERIVATION_AXIS_ORDER`) seeds the depth when the parent is missing
 * so a dangling stub still lands in a sensible column.
 */
export function lineageLayout(
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): Map<string, LineagePosition> {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const lineageEdges = edges.filter(isLineageEdge);

  // Build derivation adjacency: child id -> [{ parent id, axis order }].
  // The PROV convention: an edge labelled e.g. `authorizes` runs adr -> plan,
  // so the plan (dst) derives FROM the adr (src). We treat dst as the child.
  const parentsOf = new Map<string, { parent: string; order: number }[]>();
  const onSpine = new Set<string>();
  for (const e of lineageEdges) {
    const order = DERIVATION_AXIS_ORDER[e.derivation as string] ?? 0;
    const list = parentsOf.get(e.dst) ?? [];
    list.push({ parent: e.src, order });
    parentsOf.set(e.dst, list);
    onSpine.add(e.src);
    onSpine.add(e.dst);
  }

  // Longest-path depth with memoization; cycle-safe via a visiting guard.
  const depthMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const memo = depthMemo.get(id);
    if (memo !== undefined) return memo;
    if (visiting.has(id)) return 0; // cycle guard: break at the back-edge
    visiting.add(id);
    const parents = parentsOf.get(id);
    let depth = 0;
    if (parents && parents.length > 0) {
      for (const { parent, order } of parents) {
        const parentPresent = nodeIds.has(parent);
        // A present parent contributes its own depth + 1; a MISSING parent
        // (dangling) contributes the axis order it implies, so the stub still
        // lands in a sensible column without a fabricated edge.
        const parentDepth = parentPresent ? depthOf(parent) + 1 : order + 1;
        depth = Math.max(depth, parentDepth);
      }
    }
    visiting.delete(id);
    depthMemo.set(id, depth);
    return depth;
  };

  // Dangling: on the spine but at least one derivation parent is not in the slice.
  const isDangling = (id: string): boolean => {
    const parents = parentsOf.get(id);
    if (!parents || parents.length === 0) return false;
    return parents.some((p) => !nodeIds.has(p.parent));
  };

  // Assign columns by depth (spine nodes) or the holding lane (off-spine nodes).
  const byColumn = new Map<number, string[]>();
  const holding: string[] = [];
  for (const node of nodes) {
    if (onSpine.has(node.id)) {
      const d = depthOf(node.id);
      const col = byColumn.get(d) ?? [];
      col.push(node.id);
      byColumn.set(d, col);
    } else {
      holding.push(node.id);
    }
  }

  const out = new Map<string, LineagePosition>();
  // Deterministic vertical ordering within a column (by id) so the layout is
  // stable across re-runs (mental-map preservation).
  for (const [depth, ids] of byColumn) {
    const ordered = [...ids].sort();
    const offset = ((ordered.length - 1) * LINEAGE_ROW_SPACING) / 2;
    ordered.forEach((id, i) => {
      out.set(id, {
        x: depth * LINEAGE_COL_SPACING,
        y: i * LINEAGE_ROW_SPACING - offset,
        depth,
        onSpine: true,
        dangling: isDangling(id),
      });
    });
  }
  const holdingSorted = [...holding].sort();
  const holdingOffset = ((holdingSorted.length - 1) * LINEAGE_ROW_SPACING) / 2;
  holdingSorted.forEach((id, i) => {
    out.set(id, {
      x: LINEAGE_HOLDING_X,
      y: i * LINEAGE_ROW_SPACING - holdingOffset,
      depth: -1,
      onSpine: false,
      dangling: false,
    });
  });
  return out;
}
