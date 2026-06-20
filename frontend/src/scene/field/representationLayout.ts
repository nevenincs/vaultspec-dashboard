// Representation-mode layout dispatcher (graph-representation ADR, W02.P05.S22).
//
// The representation mode is a CPU-worker spatialization of the SAME served nodes
// (the composition rule: lens selects which nodes, mode selects where they sit).
// This dispatcher maps a mode to a STATIC seed layout the field then feeds into
// the layout engine:
//
//   connectivity (default) -> ForceAtlas2 settles freely (no static seed here;
//                              the FA2 worker owns positions). Returns null.
//   lineage                -> the derivation-DAG axis layout (static positions).
//   semantic               -> the UMAP projection over embeddings (static
//                              positions, connectivity fallback for embeddingless
//                              nodes), v1-GATED — held until the gate passes.
//
// `connectivity` returns null because its positions are owned by the FA2 worker
// (the warm-started force solver); lineage and semantic return explicit seed
// positions because they are deterministic spatializations the worker is then
// stopped over (like the existing circular mode). Scene-layer module:
// framework-free.

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { communityLayout } from "./communityLayout";
import { hierarchicalLayout } from "./hierarchicalLayout";
import { lineageLayout } from "./lineageLayout";
import { radialLayout } from "./radialLayout";

/**
 * The spatial representation modes (distinct from the force/circular tuning).
 *
 * connectivity — Cosmos owns live positions (no deterministic seed).
 * lineage      — the deterministic derivation-DAG provenance spine.
 * hierarchical — a general layered (Sugiyama) seed over the structural backbone
 *                (graph-layout-catalog D2/D3, W02.P06) — DISTINCT from lineage.
 * radial       — a deterministic tidy-tree seed over the backbone, salience-root
 *                (graph-layout-catalog D4/D5, W02.P05).
 * community    — a deterministic Louvain two-level clustered seed
 *                (graph-layout-catalog D8/D9, W02.P07).
 *
 * The three new modes (hierarchical/radial/community) ship UN-GATED (D10): they
 * need no new wire data and are near-linear at the bounded ceiling.
 */
export type RepresentationMode =
  | "connectivity"
  | "temporal"
  | "lineage"
  | "hierarchical"
  | "radial"
  | "community";

/** The default first-load mode (graph-representation ADR: connectivity). */
export const DEFAULT_REPRESENTATION_MODE: RepresentationMode = "connectivity";

/**
 * The per-node honesty + routing detail the lineage mode carries to the edge
 * layer (graph-lineage-dag ADR D6): the preserved depth/onSpine/dangling flags
 * (replacing the prior discard at the seed-position fold) and the routed
 * dummy-node waypoints per derivation edge that the edge mesh folds into its
 * line-list topology. Present ONLY for the lineage mode; the connectivity and
 * semantic seeds carry no such detail.
 */
export interface LineageRenderDetail {
  /** Node id -> preserved derivation honesty flags.
   *
   *  PARTIALLY CONSUMED (W03 review): the off-spine/gutter POSITIONS these flags
   *  drive are already correct (the lineage layout places off-spine nodes in the
   *  feature-adjacency/temporal/gutter lanes and dangling stubs in a sensible
   *  column). What is NOT yet wired is the per-node VISUAL TREATMENT — fading an
   *  off-spine node and marking a dangling stub — because that needs a new
   *  field→sprite command channel and sprite-layer changes (an alpha-fade pass and
   *  a dangling glyph) that are out of scope for this pass. The flags are carried
   *  here ready for that treatment; until it lands, the honesty reads through
   *  POSITION (lane placement) rather than through fade/marker. Deferred
   *  enhancement, recorded so the seam is not silently unconsumed. */
  nodes: Map<string, { depth: number; onSpine: boolean; dangling: boolean }>;
  /** Derivation edge id -> ordered intermediate waypoints (src..dst, exclusive). */
  routes: Map<string, { x: number; y: number }[]>;
  /** Per-plan exec super-nodes minted by aggregate-LOD (D8); empty below the
   *  node ceiling. */
  aggregates: Map<string, { planId: string; memberIds: string[] }>;
}

export interface RepresentationLayoutResult {
  /**
   * Explicit seed positions for a deterministic mode (lineage/semantic), or null
   * for connectivity (the FA2 worker owns those positions). When non-null, the
   * field seeds the layout from these and stops the force solver.
   */
  positions: Map<string, { x: number; y: number }> | null;
  /** The mode actually applied — may DOWNGRADE to connectivity when a gated mode
   *  (semantic) is held by its promotion gate. */
  applied: RepresentationMode;
  /** A short reason when the requested mode was downgraded (held semantic mode). */
  downgradeReason?: string;
  /**
   * Lineage-mode routing + honesty detail (D6): the depth/onSpine/dangling flags
   * and routed waypoints the lineage layout preserved, carried through to the
   * edge layer rather than discarded. Present only when `applied === "lineage"`.
   */
  lineageDetail?: LineageRenderDetail;
}

/**
 * Compute the seed layout for a representation mode. Pure dispatch over the served
 * slice; the semantic mode is downgraded to connectivity when its measured
 * promotion gate has not passed (the v1-gated decision in the ADR ledger).
 *
 * `selectedId`, when present in the slice, is the current scene selection: the
 * radial mode uses it to OVERRIDE its salience-root policy (graph-layout-catalog
 * D5 focus+context), so the tree reads as "hops from what I'm looking at". Other
 * modes ignore it (their spatializations are selection-independent).
 */
export function representationLayout(
  mode: RepresentationMode,
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
  selectedId?: string,
): RepresentationLayoutResult {
  switch (mode) {
    case "temporal": {
      const positions = new Map<string, { x: number; y: number }>();
      for (const node of nodes) {
        if (
          node.seedPosition &&
          Number.isFinite(node.seedPosition.x) &&
          Number.isFinite(node.seedPosition.y)
        ) {
          positions.set(node.id, {
            x: node.seedPosition.x,
            y: node.seedPosition.y,
          });
        }
      }
      return { positions, applied: "temporal" };
    }
    case "lineage": {
      const result = lineageLayout(nodes, edges);
      const positions = new Map<string, { x: number; y: number }>();
      const nodeDetail = new Map<
        string,
        { depth: number; onSpine: boolean; dangling: boolean }
      >();
      for (const [id, p] of result.positions) {
        positions.set(id, { x: p.x, y: p.y });
        nodeDetail.set(id, {
          depth: p.depth,
          onSpine: p.onSpine,
          dangling: p.dangling,
        });
      }
      return {
        positions,
        applied: "lineage",
        lineageDetail: {
          nodes: nodeDetail,
          routes: result.routes,
          aggregates: result.aggregates,
        },
      };
    }
    case "hierarchical": {
      // A general layered (Sugiyama) seed over the structural backbone (D2/D3) —
      // distinct from lineage: it carries no spine/dangling honesty, lays every
      // served node, and ships un-gated (D10). Held stopped over the seed.
      const positions = hierarchicalLayout(nodes, edges);
      return { positions, applied: "hierarchical" };
    }
    case "radial": {
      // A deterministic tidy-tree seed over the backbone, salience-max root with
      // per-component angular sectors (D4/D5). A live selection OVERRIDES the
      // salience root for its component (focus+context). Ships un-gated (D10).
      const positions = radialLayout(nodes, edges, selectedId);
      return { positions, applied: "radial" };
    }
    case "community": {
      // A deterministic Louvain two-level clustered seed (D8/D9): hand-rolled
      // Louvain over the backbone + circular two-level placement. Ships un-gated
      // (D10). featureHulls may optionally read the membership as an OVERLAY, never
      // a re-layout — that overlay drive lives in the overlay layer, not here.
      const positions = communityLayout(nodes, edges);
      return { positions, applied: "community" };
    }
    case "connectivity":
    default:
      return { positions: null, applied: "connectivity" };
  }
}
