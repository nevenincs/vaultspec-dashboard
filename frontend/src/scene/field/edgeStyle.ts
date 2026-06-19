// Edge style + classification helpers — the pure, PIXI-FREE functions that classify
// an edge (tier group key, lineage axis), resolve its colour (uniform scene-rule
// grey, confidence lightness mix), and size its soft treatments (haze / meta-ribbon
// half-width). Extracted from edgeMeshes.ts so the surviving three.js field + stores
// + tests depend on a pixi-free module; the pixi-bound `EdgeMeshLayer` and the
// Float32Array buffer writers (`write*`) stay in edgeMeshes.ts and import these
// back. Scene-layer module: framework-free by design — no pixi, no React.

import type { SceneEdgeData } from "../sceneController";
import { cssColorNumber as getCssColor } from "./tokenReads";

export const EDGE_TIERS = ["declared", "structural", "temporal", "semantic"] as const;
export type EdgeTier = (typeof EDGE_TIERS)[number];

/** Light-mode fallback for the scene rule grey (node test env has no document). */
export const SCENE_RULE_FALLBACK = 0xd8d2ca;

export class UnknownTierError extends Error {
  readonly edgeId: string;
  readonly tier: string;
  constructor(edgeId: string, tier: string) {
    super(
      `edge ${edgeId} carries unknown tier "${tier}" — refusing to render it silently`,
    );
    this.edgeId = edgeId;
    this.tier = tier;
  }
}

/**
 * Group key for an edge: which mesh it batches into. Throws on unknown
 * tiers — the caller surfaces the error, never re-buckets.
 */
export function edgeGroupKey(edge: SceneEdgeData): string {
  // Constellation meta-edges are their own treatment: an aggregation
  // ribbon (quad, width by count), not a tier line (G3.d).
  if (edge.meta) return "meta";
  switch (edge.tier) {
    case "declared":
      return "declared";
    case "structural":
      return `structural:${edge.state ?? "resolved"}`;
    case "temporal":
      return `temporal:${confidenceBucket(edge.confidence)}`;
    case "semantic":
      return `semantic:${confidenceBucket(edge.confidence)}`;
    default:
      throw new UnknownTierError(edge.id, String(edge.tier));
  }
}

/**
 * Pipeline-derivation labels in PROV/lineage axis order (graph-node-semantics /
 * graph-representation): the directed chain research -> adr -> plan -> exec ->
 * audit -> rule. A derivation-bearing edge is a LINEAGE edge — the lineage layout
 * orders nodes along this axis. Tier still carries the line treatment (the channel
 * separation is preserved): derivation never becomes a competing edge colour, it
 * is a layout-axis and edge-classification signal only.
 */
export const DERIVATION_AXIS_ORDER: Record<string, number> = {
  grounds: 0, // research -> adr
  authorizes: 1, // adr -> plan
  binds: 1, // adr -> plan (synonym)
  "generated-by": 2, // plan -> exec
  aggregates: 3, // exec -> summary
  reviews: 4, // exec -> audit
  "promoted-from": 5, // audit -> rule
};

/** True when the edge carries a pipeline-derivation label (a lineage edge). */
export function isLineageEdge(edge: SceneEdgeData): boolean {
  return (
    typeof edge.derivation === "string" && edge.derivation in DERIVATION_AXIS_ORDER
  );
}

/** Confidence quantized to 4 lightness buckets (0 = faintest, 3 = fullest). */
export function confidenceBucket(confidence: number): number {
  const c = Math.max(0, Math.min(1, confidence));
  return Math.min(3, Math.floor(c * 4));
}

/**
 * Mix a colour toward the canvas-background ground — lightness carries
 * confidence (per the ADR: lightness, never transparency). The optional `paper`
 * argument lets callers pass the resolved theme value; when absent, the light-mode
 * paper warm-white is used (keeps unit tests pure).
 */
export function mixTowardPaper(
  color: number,
  amount: number,
  paper = { r: 0xfa, g: 0xf9, b: 0xf7 },
): number {
  const t = Math.max(0, Math.min(1, amount));
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (ch: number, p: number) => Math.round(ch + (p - ch) * t);
  return (mix(r, paper.r) << 16) | (mix(g, paper.g) << 8) | mix(b, paper.b);
}

/** Lightness mix for a group: bucket 3 → 0 (full ink), bucket 0 → 0.6. */
export function bucketLightness(bucket: number): number {
  return (3 - Math.max(0, Math.min(3, bucket))) * 0.2;
}

/**
 * Resolved stroke colour for a group key — now a SINGLE uniform grey for every
 * tier (graph/Hero 85:2 binding redesign): the --color-scene-rule scene token,
 * read as literal hex per theme through the scene token seam. The `key` argument
 * is retained (the grouping still partitions by tier so each treatment's geometry
 * survives), but the resolved tint no longer varies by tier/state/confidence —
 * the canvas edge is one clean grey rule, the way the Hero shows it. In the node
 * test environment the seam returns the SCENE_RULE_FALLBACK light-mode grey.
 */
export function groupColor(_key: string): number {
  return getCssColor("--color-scene-rule", SCENE_RULE_FALLBACK);
}

/** Semantic haze half-width from the score (width by score per G3.c). */
export function hazeHalfWidth(confidence: number): number {
  return 0.75 + 1.25 * Math.max(0, Math.min(1, confidence));
}

/** Meta-edge ribbon half-width from the aggregated count (G3.d). */
export function metaHalfWidth(count: number): number {
  return Math.min(6, 1 + Math.log2(Math.max(1, count)) * 1.5);
}
