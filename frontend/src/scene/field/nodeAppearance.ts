// Node visual-anatomy helpers — the pure, PIXI-FREE functions that map a node's
// data to its on-canvas appearance (radius, body/ring/rim colour, LOD level, label
// priority, progress/tier/freshness). Extracted from nodeSprites.ts so the surviving
// three.js field + stores + tests depend on a pixi-free module; the pixi-bound
// `NodeSpriteLayer` + `GlyphTextureProvider` stay in nodeSprites.ts and import these
// back. Scene-layer module: framework-free by design — no pixi, no React.

import type { SceneNodeData } from "../sceneController";
import { categoryColor } from "./categoryColor";
import { stampFor } from "./statusStamp";
import { cssColorNumber as getCssColor } from "./tokenReads";

// --- pure anatomy helpers (unit-tested; rendering maps these) ---------------

export type LodLevel = "far" | "near";

/** World-scale threshold above which the label + full anatomy unfold. Set to the
 * feature LOD (0.6) so labels show in the default fit-to-view, matching the
 * Obsidian mental model where the graph labels at overview scale. */
export const NEAR_ZOOM_THRESHOLD = 0.6;

/**
 * Label/badge raster density. Pixi rasterizes Text to a texture at this
 * resolution ONCE; the camera then scales the whole world container, so a label
 * left at the renderer's base resolution (DPR) turns to mush the moment the user
 * zooms in past 1×. Rasterizing the labels at DPR × a zoom-crispness headroom
 * keeps them sharp through the normal zoom-in range at a modest texture-size cost. */
const LABEL_ZOOM_HEADROOM = 3;
export function labelResolution(): number {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, dpr) * LABEL_ZOOM_HEADROOM;
}

/** Focused nodes always carry full anatomy regardless of zoom (§3.1). */
export function lodFor(scale: number, focused: boolean): LodLevel {
  return focused || scale >= NEAR_ZOOM_THRESHOLD ? "near" : "far";
}

/**
 * Lifecycle state colours — resolved from the literal-hex scene token layer so
 * the palette tracks the active theme. These tint the near-LOD progress ring;
 * they are NOT the node body fill (the body fill is the category hue). In the
 * node test env getCssColor returns the light-mode fallbacks.
 */
function readStateColors(): Record<string, number> {
  return {
    active: getCssColor("--color-state-active", 0x2f7d4f),
    complete: getCssColor("--color-state-complete", 0x4a4137),
    archived: getCssColor("--color-state-archived", 0x9a938a),
    broken: getCssColor("--color-state-broken", 0xb3502d),
    stale: getCssColor("--color-state-stale", 0xa07520),
  };
}

export function stateColor(lifecycle?: SceneNodeData["lifecycle"]): number {
  const defaultColor = getCssColor("--color-ink-muted", 0x6a6258);
  if (!lifecycle) return defaultColor;
  return readStateColors()[lifecycle.state] ?? defaultColor;
}

/** Alpha floor a ghosted (retired/archived/superseded) node disc dims to. */
export const GHOST_ALPHA = 0.4;

/** Freshness as a 0..1 scalar: 1 at modification, cooling to a floor over 30
 *  days. Kept for off-canvas recency consumers; not applied to the disc. */
export const FRESHNESS_WINDOW_MS = 30 * 24 * 3600 * 1000;
export const FRESHNESS_FLOOR = 0.55;

export function freshnessAlpha(modified: string | undefined, now: number): number {
  if (!modified) return FRESHNESS_FLOOR;
  const at = Date.parse(modified);
  if (!Number.isFinite(at)) return FRESHNESS_FLOOR;
  const age = Math.max(0, now - at);
  const heat = Math.max(0, 1 - age / FRESHNESS_WINDOW_MS);
  return FRESHNESS_FLOOR + (1 - FRESHNESS_FLOOR) * heat;
}

/** Plan/feature progress as a 0..1 ring fraction, or null when ringless. */
export function progressFraction(
  lifecycle?: SceneNodeData["lifecycle"],
): number | null {
  const p = lifecycle?.progress;
  if (!p || p.total <= 0) return null;
  return Math.max(0, Math.min(1, p.done / p.total));
}

/** Tier badge line, e.g. "◆3 ▣5 ◷2 ≈14" — only populated tiers appear. */
const TIER_MARKS: [keyof NonNullable<SceneNodeData["degreeByTier"]>, string][] = [
  ["declared", "◆"],
  ["structural", "▣"],
  ["temporal", "◷"],
  ["semantic", "≈"],
];

export function tierBadgeText(degreeByTier?: SceneNodeData["degreeByTier"]): string {
  if (!degreeByTier) return "";
  return TIER_MARKS.filter(([tier]) => (degreeByTier[tier] ?? 0) > 0)
    .map(([tier, mark]) => `${mark}${degreeByTier[tier]}`)
    .join(" ");
}

/** Salience multiplier band: salience 0 -> 1.0x base; salience 1 -> this. The base
 *  node radius lives in appearance.ts (BASE_POINT_SIZE, the live three-field path via
 *  nodeWorldRadius) — the old NODE_RADIUS=6 here was the retired cosmos/pixi duplicate. */
export const SALIENCE_RADIUS_MAX = 2.6;

// --- selected-state ring geometry (graph/Node-items 83:2 "selected") ----------
/** Clear air between the body edge and the ring (world units, scaled by camera). */
export const SELECTED_RING_GAP = 2.5;
/** Selected accent ring stroke width (world units). */
export const SELECTED_RING_WIDTH = 1.5;

/** Centre radius of the selected accent ring for a given body radius. */
export function selectedRingRadius(bodyRadius: number): number {
  return bodyRadius + SELECTED_RING_GAP + SELECTED_RING_WIDTH / 2;
}

/**
 * The node BODY fill colour (graph/Hero, graph/Node-items): the node's category
 * hue, read from the scene-category token seam (literal hex per theme). A ghost
 * (retired/archived/superseded) node desaturates to the archived neutral — the
 * single circle-level status treatment — so the category hue never claims a node
 * the corpus has retired.
 */
export function bodyColor(node: SceneNodeData): number {
  const ghost = stampFor(node.status).ghost;
  return ghost
    ? getCssColor("--color-state-archived", 0x9a938a)
    : categoryColor(node.kind);
}

/** The selected accent ring colour — the single muted accent (warmth rule: "the
 *  single muted accent for selection rings"), read as literal hex per theme. */
export function selectedRingColor(): number {
  return getCssColor("--color-state-active", 0x3f774d);
}

// --- DEFAULT-state body rim (graph/Node-items 83:2 "default") ------------------
/** Default-state body-rim hairline width (world units, scaled by the camera). */
export const BODY_RIM_WIDTH = 0.75;
/** How far the rim darkens the body hue toward black (0 = no change, 1 = black).
 *  A gentle 22% keeps the rim clearly in-family with the fill. */
export const BODY_RIM_DARKEN = 0.22;

/** Darken a 24-bit RGB colour toward black by `amount` in [0,1], per channel.
 *  Pure and theme-agnostic: the rim tracks whatever hex the body resolved to. */
export function darkenColor(color: number, amount: number): number {
  const k = 1 - Math.max(0, Math.min(1, amount));
  const r = Math.round(((color >> 16) & 0xff) * k);
  const g = Math.round(((color >> 8) & 0xff) * k);
  const b = Math.round((color & 0xff) * k);
  return (r << 16) | (g << 8) | b;
}

/** The default-state rim colour for a body fill: an in-family darkened shade of
 *  the body's own hue (never a second accent). */
export function bodyRimColor(fill: number): number {
  return darkenColor(fill, BODY_RIM_DARKEN);
}

/**
 * Label priority for the DOI label cull: higher = labelled sooner as the field
 * declutters. Salience is the primary signal; member-count breaks ties for
 * feature nodes when salience is absent. Focused/pinned/lifted nodes are always
 * labelled (handled by the LOD pass); this orders the AMBIENT field.
 */
export function labelPriority(node: SceneNodeData): number {
  if (typeof node.salience === "number") {
    return Math.max(0, Math.min(1, node.salience));
  }
  if (node.kind === "feature" && node.memberCount && node.memberCount > 0) {
    return Math.min(1, 0.5 + Math.log2(1 + node.memberCount) * 0.1);
  }
  return 0.2;
}

/**
 * Ambient label-priority floor by zoom: at low ambient zoom only the highest-
 * salience nodes label; the floor relaxes as the user zooms in, until at the near
 * threshold every near node labels. Focused/pinned/lifted nodes always label
 * regardless (handled in the layer's `refresh`).
 */
export function ambientLabelFloor(scale: number): number {
  if (scale >= 1.6) return 0;
  if (scale <= NEAR_ZOOM_THRESHOLD) return 0.6;
  const t = (scale - NEAR_ZOOM_THRESHOLD) / (1.6 - NEAR_ZOOM_THRESHOLD);
  return 0.6 * (1 - t);
}
