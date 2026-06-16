// Layout-backbone selection (graph-representation ADR, W02.P07).
//
// The anti-hairball discipline: LAY OUT and DRAW on the high-precision structural
// backbone (declared + structural only), and layer the noisy temporal/semantic
// tiers as disparity-thinned, bundled, DOI-gated, filterable CONTEXT on top.
//
// The ADR is explicit about two DISTINCT backbones:
//   - the CENTRALITY backbone the salience ADR computes on is tier-WEIGHTED (all
//     four tiers, declared >= structural >> temporal >= semantic);
//   - the LAYOUT backbone drawn here is the high-precision SUBSET (declared +
//     structural only), with temporal/semantic as layered context, not layout
//     input.
// This module produces the LAYOUT backbone: the edges the force driver is fed.
//
// Connection-drawing fidelity (figma-parity-reconciliation W03.P09.S56, binding
// `graph/Hero` 85:2): the Hero binding reads as CLEAN category circles sitting on
// a FAINT connective rule field, never a coloured hairball. The flat-grey stroke
// treatment is rendered in `edgeMeshes.ts` (S45); the CLEANNESS of that field is
// produced HERE — the split lays out on the precise declared+structural backbone
// and disparity-thins the noisy tiers into a significant-subset context, so the
// drawn field is the spare connective mesh the Hero shows rather than every raw
// edge. The split contract (backbone = declared + structural + meta, context =
// disparity-thinned noisy tiers) is unchanged: it is the locked anti-hairball
// shape every non-lineage layout (community/hierarchical/radial/connectivity) and
// the field assembly consume, so the Hero fidelity is achieved through the
// EXISTING split, not a re-tuning of which tiers lay out.
//
// Bounded by default (graph-queries-are-bounded-by-default): this operates on the
// slice the engine already bounded — the constellation LOD or the document
// granularity capped by the engine's `MAX_DOCUMENT_NODES` node ceiling and
// carried through the stores `truncated` block. The split only PARTITIONS that
// bounded edge set; it never re-expands it, requests more, or serializes an
// unbounded full-document field onto the wire. Descent into document detail stays
// the engine's bounded responsibility; the connection field drawn here is always
// over the already-bounded slice.
//
// Pure function; scene-layer module, framework-free.

import type { SceneEdgeData } from "../sceneController";
import { disparityFilter } from "./disparityFilter";

/** The two tiers that form the layout backbone (high-precision, never thinned). */
export const LAYOUT_BACKBONE_TIERS = new Set(["declared", "structural"]);

export interface BackboneSplit {
  /** The layout backbone: declared + structural edges (fed to the force driver). */
  backbone: SceneEdgeData[];
  /**
   * The layered context: temporal + semantic edges, disparity-thinned to their
   * significant subset. Drawn (bundled, DOI-gated) but NOT fed to the layout.
   */
  context: SceneEdgeData[];
}

/**
 * Split a slice's edges into the layout backbone and the layered context. Meta
 * (constellation) edges are kept in the backbone — they are the engine-aggregated
 * high-level structure that lays out the constellation. The context is the
 * disparity-thinned noisy tiers.
 *
 * Pure and deterministic.
 */
export function splitBackbone(edges: readonly SceneEdgeData[]): BackboneSplit {
  const backbone: SceneEdgeData[] = [];
  const noisy: SceneEdgeData[] = [];
  for (const e of edges) {
    if (e.meta || LAYOUT_BACKBONE_TIERS.has(e.tier)) {
      backbone.push(e);
    } else {
      noisy.push(e);
    }
  }
  // The context is the noisy tiers thinned to their significant subset.
  const context = disparityFilter(noisy);
  return { backbone, context };
}

/** Just the layout-backbone edge ids (the force driver's input set). */
export function backboneEdgeIds(edges: readonly SceneEdgeData[]): Set<string> {
  return new Set(splitBackbone(edges).backbone.map((e) => e.id));
}
