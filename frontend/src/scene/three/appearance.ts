// Visual-appearance parity with CosmosField. These node-size and edge-appearance
// formulas + constants MIRROR the private ones in `cosmosField.ts` (cosmosPointSize,
// edgeAppearance, the EDGE_* / SALIENCE_RADIUS_MAX constants) so the three.js field
// reads visually on-par with cosmos. Colours come from the SAME token seam cosmos
// uses (categoryColor / cssColorNumber on the scene-read literal-hex tokens), so a
// theme change re-themes both fields identically. Scene-layer module: framework-free.

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { categoryColor } from "../field/categoryColor";
import { SALIENCE_RADIUS_MAX } from "../field/nodeSprites";
import { cssColorNumber } from "../field/tokenReads";

// Mirror of cosmosField's COSMOS_POINT_SIZE — the base node diameter, used here as
// the base world radius so relative sizing matches cosmos.
const BASE_POINT_SIZE = 4;

const EDGE_ALPHA_MIN = 0.1;
const EDGE_ALPHA_MAX = 0.5;
const EDGE_WIDTH_MIN = 0.6;
const EDGE_WIDTH_MAX = 2.2;

/** World-space node radius — mirrors cosmosField.cosmosPointSize. */
export function nodeWorldRadius(node: SceneNodeData): number {
  if (typeof node.salience === "number") {
    const s = Math.max(0, Math.min(1, node.salience));
    return BASE_POINT_SIZE * (1 + s * (SALIENCE_RADIUS_MAX - 1));
  }
  if (node.kind === "feature" && node.memberCount && node.memberCount > 0) {
    return BASE_POINT_SIZE * (1.4 + Math.log2(1 + node.memberCount) * 0.5);
  }
  return BASE_POINT_SIZE;
}

/** Node body fill — the eight-category hue through the scene token seam. */
export function nodeColorNumber(node: SceneNodeData): number {
  return categoryColor(node.docType ?? node.kind);
}

export interface EdgeAppearance {
  color: number;
  alpha: number;
  width: number;
}

/** Live tier-colour palette (read per set-data so it tracks the active theme). */
export function readTierColors(): Record<string, number> {
  return {
    declared: cssColorNumber("--color-tier-declared", 0x312d27),
    structural: cssColorNumber("--color-tier-structural", 0x3f774d),
    temporal: cssColorNumber("--color-tier-temporal", 0x5c5040),
    semantic: cssColorNumber("--color-tier-semantic", 0x8b85b7),
    rule: cssColorNumber("--color-scene-rule", 0xd8d2ca),
  };
}

/** Edge colour / alpha / width — mirrors cosmosField.edgeAppearance. */
export function edgeAppearance(
  edge: SceneEdgeData,
  tierColors: Record<string, number>,
): EdgeAppearance {
  const known = edge.tier in tierColors;
  const color = tierColors[edge.tier] ?? tierColors.rule;
  const conf =
    typeof edge.confidence === "number" ? Math.max(0, Math.min(1, edge.confidence)) : 1;
  let alpha = EDGE_ALPHA_MIN + (EDGE_ALPHA_MAX - EDGE_ALPHA_MIN) * conf;
  if (!known) alpha *= 0.6;
  if (edge.state === "broken") alpha *= 0.55;
  else if (edge.state === "stale") alpha *= 0.78;
  const width = EDGE_WIDTH_MIN + (EDGE_WIDTH_MAX - EDGE_WIDTH_MIN) * conf;
  return { color, alpha, width };
}

export function canvasBackground(): number {
  return cssColorNumber("--color-canvas-bg", 0xfdfaf6);
}

export function accentColor(): number {
  return cssColorNumber("--color-accent", 0x8a7d5a);
}

export function inkColor(): number {
  return cssColorNumber("--color-ink", 0x2b2722);
}

export function inkMutedColor(): number {
  return cssColorNumber("--color-ink-muted", 0x6f675c);
}
