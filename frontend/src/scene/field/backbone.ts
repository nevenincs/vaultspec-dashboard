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
// This module produces the LAYOUT backbone: the edges the FA2 worker is fed.
//
// Pure function; scene-layer module, framework-free.

import type { SceneEdgeData } from "../sceneController";
import { disparityFilter } from "./disparityFilter";

/** The two tiers that form the layout backbone (high-precision, never thinned). */
export const LAYOUT_BACKBONE_TIERS = new Set(["declared", "structural"]);

export interface BackboneSplit {
  /** The layout backbone: declared + structural edges (fed to the FA2 worker). */
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

/** Just the layout-backbone edge ids (the FA2 worker's input set). */
export function backboneEdgeIds(edges: readonly SceneEdgeData[]): Set<string> {
  return new Set(splitBackbone(edges).backbone.map((e) => e.id));
}
