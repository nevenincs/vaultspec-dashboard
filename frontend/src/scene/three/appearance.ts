// Visual-appearance formulas + constants for the three.js field: node size
// (nodeWorldRadius / BASE_POINT_SIZE / SALIENCE_RADIUS_MAX) and edge appearance
// (the EDGE_* constants). Originally derived from the now-retired CosmosField for
// visual parity; this module is now their canonical home. Colours come from the
// shared token seam (categoryColor / cssColorNumber on the scene-read literal-hex
// tokens), so a theme change re-themes the field. Scene-layer module: framework-free.

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { categoryColor } from "../field/categoryColor";
import { cssColorNumber } from "../field/tokenReads";
import { appearanceDefaults, controlNumber } from "./graphControlSchema";

// The base node diameter, used as the base world radius for relative node sizing.
// (Originally COSMOS_POINT_SIZE from the retired CosmosField.)
const BASE_POINT_SIZE = 4;
/** Prominence multiplier band: an unconnected node → 1.0× base; a node at/above the
 *  reference connectedness → this × base. (Historically the salience band; node size is
 *  now driven by CONNECTEDNESS — see nodeWorldRadius. Kept named for the schema's
 *  salienceRadiusMax registry mirror and the unchanged size ceiling.) */
export const SALIENCE_RADIUS_MAX = 2.6;
/** Reference total degree that maps to FULL prominence (the log-mapping denominator):
 *  a node with this many reference edges (in+out) reaches the top of the size band; more
 *  connected nodes clamp there. Engine-served degree drives the size, this only bounds
 *  the mapping (bounded-by-default) so a few mega-hubs can't dwarf the field. */
const DEGREE_PROMINENCE_REF = controlNumber("nodeDegreeReference");
/** Precomputed log denominator for the degree → prominence mapping. */
const DEGREE_PROMINENCE_LOG_REF = Math.log2(1 + DEGREE_PROMINENCE_REF);

/** Total connectedness of a node: the engine-served per-tier degree counts summed
 *  (reference edges touching the node, in+out). Returns null when the wire carried no
 *  degree block (a client-synthesized node) so the caller can fall back. The frontend
 *  only READS the served degree (degreeByTier) and MAPS it to a radius; it never
 *  recomputes connectedness (display-state-is-backend-served). */
function nodeDegree(node: SceneNodeData): number | null {
  const dbt = node.degreeByTier;
  if (!dbt) return null;
  let sum = 0;
  for (const v of Object.values(dbt)) sum += typeof v === "number" ? v : 0;
  return sum;
}

// Edge-state alpha multipliers — read FROM the canonical control registry
// (graphControlSchema) so each has ONE definition (value-preserving: unknown-tier 0.6,
// broken 0.55, stale 0.78). The field dims an edge of an unknown tier, or a stale/broken
// structural edge, by these factors.
const EDGE_UNKNOWN_TIER_ALPHA_MULT = controlNumber("edgeUnknownTierAlphaMult");
const EDGE_BROKEN_ALPHA_MULT = controlNumber("edgeBrokenAlphaMult");
const EDGE_STALE_ALPHA_MULT = controlNumber("edgeStaleAlphaMult");

/**
 * Edge colour inheritance mode. An edge NEVER carries a flat tier/grey/black colour
 * — it inherits the category hue of its endpoint node(s):
 *   - "solid"    both ends take the SOURCE (leaf) node's hue → a flat edge in the leaf colour.
 *   - "gradient" end A = source hue, end B = target hue → the shader blends leaf→parent.
 */
export type EdgeColorMode = "solid" | "gradient";

/**
 * The configurable "look" surface for the three.js field — node module size, edge
 * width/opacity, and edge colour-inheritance mode. Defaults reproduce the constants
 * above EXACTLY (and "solid" edge colour), so an unparameterized call is the stock
 * appearance. Live-tuned through `ThreeField.setAppearanceParams`; the lab knob
 * metadata lives in `appearanceControls.ts` (the appearance sibling of `forceControls.ts`).
 */
export interface AppearanceParams {
  /** Global multiplier on every node's drawn world radius ("node module size").
   *  Also re-feeds forceCollide so non-overlap spacing tracks the drawn size. */
  nodeSizeScale: number;
  /** Multiplier on the salience-driven size spread (0 = salience ignored, all
   *  nodes the base size; 1 = the stock SALIENCE_RADIUS_MAX spread). */
  nodeSalienceScale: number;
  /** Thinnest / thickest edge (world-derived px) at confidence 0 / 1. */
  edgeWidthMin: number;
  edgeWidthMax: number;
  /** Faintest / strongest edge opacity at confidence 0 / 1. */
  edgeOpacityMin: number;
  edgeOpacityMax: number;
  /** How an edge inherits colour from its endpoint nodes (never tier/grey/black). */
  edgeColorMode: EdgeColorMode;
  /** Draw nodes as their doc-type element mark instead of a plain category circle
   *  (graph-node-icons). A toggle — circles cross-fade to icons by on-screen size. */
  nodeIcons: boolean;
}

// Derived from the canonical control registry (graphControlSchema) — the schema is
// the single source of truth for the appearance defaults (node size/salience spread,
// edge width/opacity range, and the gradient edge-colour default; "solid" remains a
// selectable mode). graph-backend-unification ADR D2: gradient edges are binding.
export const APPEARANCE_DEFAULTS: AppearanceParams = appearanceDefaults();

/** World-space node radius — BASE_POINT_SIZE scaled by the live appearance params.
 *
 *  Visual prominence scales with CONNECTEDNESS: a node's drawn radius (and therefore,
 *  via the collide radii fed from this same function, its layout footprint) grows with
 *  its engine-served total degree (reference edges in+out). The mapping is BOUNDED and
 *  MONOTONIC — `log2(1+degree)` (diminishing returns so a doc with twice the edges isn't
 *  twice the size) normalized by the reference degree and CLAMPED to the band — so a few
 *  mega-hubs read as prominent without dwarfing the field. The spread AMOUNT is the
 *  user-facing "Importance" control (`nodeSalienceScale`: 0 = uniform, up to the band
 *  ceiling SALIENCE_RADIUS_MAX). Order: feature nodes size by member count (their
 *  connectedness analog); document nodes by served degree; salience is the graceful
 *  fallback when an origin serves a DOI scalar but no degree block; else the base. */
export function nodeWorldRadius(
  node: SceneNodeData,
  params: AppearanceParams = APPEARANCE_DEFAULTS,
): number {
  const scale = params.nodeSizeScale;
  if (node.kind === "feature" && node.memberCount && node.memberCount > 0) {
    return BASE_POINT_SIZE * (1.4 + Math.log2(1 + node.memberCount) * 0.5) * scale;
  }
  const degree = nodeDegree(node);
  if (degree !== null) {
    const f = Math.min(1, Math.log2(1 + degree) / DEGREE_PROMINENCE_LOG_REF);
    const spread = 1 + f * (SALIENCE_RADIUS_MAX - 1) * params.nodeSalienceScale;
    return BASE_POINT_SIZE * spread * scale;
  }
  if (typeof node.salience === "number") {
    const s = Math.max(0, Math.min(1, node.salience));
    const spread = 1 + s * (SALIENCE_RADIUS_MAX - 1) * params.nodeSalienceScale;
    return BASE_POINT_SIZE * spread * scale;
  }
  return BASE_POINT_SIZE * scale;
}

/** Node body fill — the seven-category hue through the scene token seam. */
export function nodeColorNumber(node: SceneNodeData): number {
  return categoryColor(node.docType ?? node.kind);
}

/** Edge geometry attributes that do NOT depend on colour. Colour is resolved
 *  separately (`edgeEndColors`) because it inherits the endpoint node hues and can
 *  blend across the edge — never a flat per-edge tier/grey/black value. */
export interface EdgeAppearance {
  alpha: number;
  width: number;
}

/** The recognised inference tiers — kept ONLY to dim an edge of an unknown tier;
 *  tier no longer drives edge colour (colour inherits from the endpoint nodes). */
const KNOWN_EDGE_TIERS = new Set(["declared", "structural", "temporal"]);

/** Edge opacity + width from confidence and the live appearance params. Colour is
 *  NOT here — see `edgeEndColors`: an edge inherits its endpoints' category hues. */
export function edgeAppearance(
  edge: SceneEdgeData,
  params: AppearanceParams = APPEARANCE_DEFAULTS,
): EdgeAppearance {
  const known = KNOWN_EDGE_TIERS.has(edge.tier);
  const conf =
    typeof edge.confidence === "number" ? Math.max(0, Math.min(1, edge.confidence)) : 1;
  let alpha =
    params.edgeOpacityMin + (params.edgeOpacityMax - params.edgeOpacityMin) * conf;
  if (!known) alpha *= EDGE_UNKNOWN_TIER_ALPHA_MULT;
  if (edge.state === "broken") alpha *= EDGE_BROKEN_ALPHA_MULT;
  else if (edge.state === "stale") alpha *= EDGE_STALE_ALPHA_MULT;
  const width =
    params.edgeWidthMin + (params.edgeWidthMax - params.edgeWidthMin) * conf;
  return { alpha, width };
}

/**
 * Resolve the per-END edge colours from the inheritance mode and the endpoint node
 * colours (`sourceColor` = the edge's first endpoint / leaf in a member→hub edge,
 * `targetColor` = its second / parent). Both inputs are the endpoints' token-derived
 * category hues, so an edge is ALWAYS coloured from the colour-token palette — never
 * a flat grey/black/tier default.
 *   - "solid"    both ends take the SOURCE (leaf) hue → a flat edge in the leaf colour.
 *   - "gradient" end A = source hue, end B = target hue → the shader blends leaf→parent.
 */
export function edgeEndColors(
  mode: EdgeColorMode,
  sourceColor: number,
  targetColor: number,
): { a: number; b: number } {
  return mode === "gradient"
    ? { a: sourceColor, b: targetColor }
    : { a: sourceColor, b: sourceColor };
}

export function canvasBackground(): number {
  return cssColorNumber("--color-canvas-bg", 0xfdfaf6);
}

export function accentColor(): number {
  return cssColorNumber("--color-accent", 0x8a7d5a);
}

/**
 * Theme-dependent HIGHLIGHT hue for the transient hover ring — deliberately a
 * different hue from the selection accent so hover and selection read apart on the
 * canvas. Must come from a resolving literal-hex scene token per theme: the
 * var()-aliased `--color-accent` / `--color-focus` do NOT resolve through the
 * scene's getComputedStyle read (the literal-hex contract), so they cannot carry a
 * theme-aware highlight. Reads the temporal-tier literal-hex token today; repoint at
 * a dedicated `--color-scene-highlight` surfaced from `--semantic-focus-ring` through
 * the token build if/when one lands.
 */
export function highlightColor(): number {
  return cssColorNumber("--color-tier-temporal", 0x5c5040);
}

export function inkColor(): number {
  return cssColorNumber("--color-ink", 0x2b2722);
}

export function inkMutedColor(): number {
  return cssColorNumber("--color-ink-muted", 0x6f675c);
}

/** Scene hairline rule — the slightly stronger border tone the canvas reads for chip /
 *  pill outlines (distinct from the lighter DOM `--color-rule`). Literal-hex per theme. */
export function sceneRuleColor(): number {
  return cssColorNumber("--color-scene-rule", 0xd8d2ca);
}

// Graph emphasis (hover / selection) uses ONLY established palette tokens: categoryColor
// for node + edge hues (gradient kept), canvasBackground for the gentle node recede,
// accentColor for the focus ring, inkColor / inkMutedColor for labels. No adhoc hover
// hexes, no near-black. The prior `--color-scene-hover-*` tokens (recede / edge-focus /
// edge-context / label-context) were adhoc-derived (one near-black) and are retired from
// the scene; their DTCG entries are now orphaned and can be pruned from the token source.
