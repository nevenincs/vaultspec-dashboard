// Disparity-filter backbone thinning (graph-representation ADR, W02.P07).
//
// The dense, low-precision temporal and semantic tiers smother any naive layout.
// The disparity filter (Serrano et al. 2009, PNAS) is the principled, cheap way to
// thin a weighted graph to its STATISTICALLY SIGNIFICANT subset: for each node,
// the normalized weight of an incident edge is tested against the null hypothesis
// that the node's edge weights are uniformly distributed; an edge survives at
// significance alpha for a node of degree k if (1 - normalizedWeight)^(k-1) <
// alpha. An edge is kept if it is significant for EITHER endpoint (the OR rule,
// which preserves the multiscale backbone).
//
// We thin only the noisy tiers (temporal, semantic) — the high-precision
// declared/structural backbone is never thinned (it IS the layout backbone). Pure
// function; scene-layer module, framework-free.

import type { SceneEdgeData } from "../sceneController";

/** The significance level: lower alpha keeps fewer, more significant edges. */
export const DISPARITY_ALPHA = 0.3;

/** Tiers subject to disparity thinning (the noisy, low-precision tiers). */
const THINNED_TIERS = new Set(["temporal", "semantic"]);

/**
 * Return the subset of `edges` that survives disparity filtering. Declared and
 * structural edges are ALWAYS kept (they are the high-precision backbone, never
 * thinned). Temporal/semantic edges are kept only if they are significant for at
 * least one endpoint at `alpha`. Edge weight is the edge `confidence`.
 *
 * Pure and deterministic.
 */
export function disparityFilter(
  edges: readonly SceneEdgeData[],
  alpha = DISPARITY_ALPHA,
): SceneEdgeData[] {
  // Per-node strength (sum of incident confidences) and degree, computed over the
  // thinnable tiers only — the null model is per-tier-family noise, and the
  // backbone tiers must not dilute the normalization.
  const strength = new Map<string, number>();
  const degree = new Map<string, number>();
  for (const e of edges) {
    if (!THINNED_TIERS.has(e.tier)) continue;
    const w = Math.max(0, e.confidence);
    strength.set(e.src, (strength.get(e.src) ?? 0) + w);
    strength.set(e.dst, (strength.get(e.dst) ?? 0) + w);
    degree.set(e.src, (degree.get(e.src) ?? 0) + 1);
    degree.set(e.dst, (degree.get(e.dst) ?? 0) + 1);
  }

  const significantFor = (node: string, w: number): boolean => {
    const k = degree.get(node) ?? 0;
    if (k <= 1) return true; // a single edge is trivially the node's backbone
    const s = strength.get(node) ?? 0;
    if (s <= 0) return false;
    const p = w / s; // normalized weight
    // Disparity null model: keep if (1 - p)^(k-1) < alpha.
    return Math.pow(1 - p, k - 1) < alpha;
  };

  return edges.filter((e) => {
    if (!THINNED_TIERS.has(e.tier)) return true; // backbone tier: always kept
    const w = Math.max(0, e.confidence);
    return significantFor(e.src, w) || significantFor(e.dst, w);
  });
}
