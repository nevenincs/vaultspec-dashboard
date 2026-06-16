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
import { SEMANTIC_MODE_GATE } from "./semanticGate";
import { semanticLayout } from "./semanticLayout";

/**
 * The spatial representation modes (distinct from the force/circular tuning).
 *
 * connectivity — the d3-force solver owns positions (the only solver mode).
 * lineage      — the deterministic derivation-DAG provenance spine.
 * hierarchical — a general layered (Sugiyama) seed over the structural backbone
 *                (graph-layout-catalog D2/D3, W02.P06) — DISTINCT from lineage.
 * radial       — a deterministic tidy-tree seed over the backbone, salience-root
 *                (graph-layout-catalog D4/D5, W02.P05).
 * community    — a deterministic Louvain two-level clustered seed
 *                (graph-layout-catalog D8/D9, W02.P07).
 * semantic     — the UMAP projection over embeddings, v1-GATED until promotion.
 *
 * The three new modes (hierarchical/radial/community) ship UN-GATED (D10): they
 * need no new wire data and are near-linear at the bounded ceiling, so there is
 * no measurable trigger to gate on — unlike semantic.
 */
export type RepresentationMode =
  | "connectivity"
  | "lineage"
  | "hierarchical"
  | "radial"
  | "community"
  | "semantic";

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
  /** Node id -> preserved derivation honesty flags. */
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
 */
export function representationLayout(
  mode: RepresentationMode,
  nodes: readonly SceneNodeData[],
  edges: readonly SceneEdgeData[],
): RepresentationLayoutResult {
  switch (mode) {
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
      // per-component angular sectors (D4/D5). Ships un-gated (D10).
      const positions = radialLayout(nodes, edges);
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
    case "semantic": {
      // v1-gated: the semantic UMAP mode ships only when the measured gate passes
      // (worker projection within the layout time budget AND clusters separate
      // legibly). Until then it is HELD and the dispatcher downgrades to
      // connectivity — never a half-built mode presented as complete.
      if (!SEMANTIC_MODE_GATE.shipped) {
        return {
          positions: null,
          applied: "connectivity",
          downgradeReason: SEMANTIC_MODE_GATE.reason,
        };
      }
      const positions = semanticLayout(nodes);
      return { positions, applied: "semantic" };
    }
    case "connectivity":
    default:
      return { positions: null, applied: "connectivity" };
  }
}
