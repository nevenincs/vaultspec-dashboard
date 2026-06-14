// Node sprite layer with LOD discipline (W01.P03.S10, ADR G3.a, §3.1 node
// anatomy).
//
// LOD discipline is the anti-hairball rule: the zoomed-out field draws
// silhouette + state colour only; full anatomy (progress ring, tier badges,
// label) renders only above the near-zoom threshold and for focused nodes.
// Shape carries type (the glyph silhouette), colour is reserved for state —
// the two channels never compete. Scene-layer module: framework-free.

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

import type { SceneGraphModel } from "../graphModel";
import type { SceneNodeData } from "../sceneController";
import { RECEDE_ALPHA } from "./egoHighlight";
import { drawProgressRing } from "./progressRing";

// --- CSS-token helpers (browser-only; node test env sees the fallback) --------

/**
 * Read a CSS custom property as a 24-bit RGB number.  In the node test
 * environment `document` is undefined, so the fallback is always returned.
 */
function getCssColor(varName: string, fallback: number): number {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  return raw.startsWith("#") ? parseInt(raw.slice(1), 16) : fallback;
}

// --- pure anatomy helpers (unit-tested; rendering maps these) ---------------

export type LodLevel = "far" | "near";

/** World-scale threshold above which full anatomy (ring, badges, label) unfolds.
 * Set to feature LOD (0.6) so labels are visible in the default fit-to-view,
 * matching the Obsidian mental model where the graph shows labels at overview
 * scale. Document LOD (1.6) was too strict — labels never appeared in practice. */
export const NEAR_ZOOM_THRESHOLD = 0.6;

/** Focused nodes always carry full anatomy regardless of zoom (§3.1). */
export function lodFor(scale: number, focused: boolean): LodLevel {
  return focused || scale >= NEAR_ZOOM_THRESHOLD ? "near" : "far";
}

/**
 * State colours — resolved from the CSS token layer so the palette adapts to
 * light/dark themes.  In the node test environment getCssColor returns the
 * light-mode fallbacks, so colour semantics are unchanged in tests.
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

/** Freshness halo decay: 1 at modification, cooling to a floor over 30 days. */
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

// --- the sprite layer ---------------------------------------------------------

/** Supplies silhouette textures per node kind (the S16 placeholder set or the
 * W02.P17 domain-mark provider plugs in behind this seam). */
export interface GlyphTextureProvider {
  textureFor(kind: string): Texture;
  /** Release cached GPU textures; called by the field on teardown. */
  destroy?(): void;
}

const NODE_RADIUS = 6;

/**
 * World-space radius for a node. Feature-convergence nodes are the
 * constellation's centers of gravity: their radius grows with `memberCount`
 * (documents converging on the feature, contract §4 / ADR D4.1), log-scaled
 * so a 5-document and an 80-document feature differ visibly without the large
 * one swamping the field. Every other species keeps the base radius — shape
 * carries their type, not size (§3.1).
 */
export function nodeRadius(node: SceneNodeData): number {
  if (node.kind !== "feature" || !node.memberCount || node.memberCount <= 0) {
    return NODE_RADIUS;
  }
  return NODE_RADIUS * (1.4 + Math.log2(1 + node.memberCount) * 0.5);
}

interface NodeVisual {
  node: SceneNodeData;
  sprite: Sprite;
  /** Lazily built full anatomy (ring, badges, label) — near LOD only. */
  anatomy: Container | null;
}

export class NodeSpriteLayer {
  private container = new Container();
  private visuals = new Map<string, NodeVisual>();
  private glyphs: GlyphTextureProvider;
  private focused = new Set<string>();

  constructor(world: Container, glyphs: GlyphTextureProvider) {
    this.glyphs = glyphs;
    world.addChild(this.container);
  }

  /** Reconcile sprites against the model by stable id. */
  sync(model: SceneGraphModel, now: number): void {
    const seen = new Set<string>();
    for (const node of model.nodes) {
      seen.add(node.id);
      let visual = this.visuals.get(node.id);
      if (!visual) {
        const sprite = new Sprite(this.glyphs.textureFor(node.kind));
        sprite.anchor.set(0.5);
        this.container.addChild(sprite);
        visual = { node, sprite, anatomy: null };
        this.visuals.set(node.id, visual);
      }
      visual.node = node;
      // Glyph textures are supersampled; sprites draw at node size in world
      // units regardless of texture resolution. Feature nodes scale with
      // their convergence weight (nodeRadius).
      const radius = nodeRadius(node);
      visual.sprite.setSize(radius * 2, radius * 2);
      visual.sprite.tint = stateColor(node.lifecycle);
      visual.sprite.alpha = freshnessAlpha(node.dates?.modified, now);
      if (visual.anatomy) this.rebuildAnatomy(visual);
    }
    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        visual.sprite.destroy();
        visual.anatomy?.destroy({ children: true });
        this.visuals.delete(id);
      }
    }
  }

  /** Per-frame position pass (layout worker output / cached positions). */
  updatePositions(
    positionOf: (id: string) => { x: number; y: number } | undefined,
  ): void {
    for (const [id, visual] of this.visuals) {
      const p = positionOf(id);
      if (!p) continue;
      visual.sprite.position.set(p.x, p.y);
      visual.anatomy?.position.set(p.x, p.y);
    }
  }

  /** Semantic-zoom LOD switch; focused ids keep full anatomy at any zoom. */
  setLod(scale: number, focusedIds: ReadonlySet<string>): void {
    this.focused = new Set(focusedIds);
    this.lastScale = scale;
    this.refresh();
  }

  /**
   * Ego-highlight (G3.b): lifted ids keep full alpha and show labels at
   * any zoom (DOI culling); the rest of the field recedes. Null clears.
   */
  setHighlight(lifted: ReadonlySet<string> | null): void {
    this.highlight = lifted;
    this.refresh();
  }

  private lastScale = 1;
  private highlight: ReadonlySet<string> | null = null;

  /** Re-apply LOD + highlight to every visual. */
  private refresh(): void {
    const now = Date.now();
    for (const visual of this.visuals.values()) {
      const id = visual.node.id;
      const lifted = this.highlight?.has(id) ?? false;
      const level = lodFor(this.lastScale, this.focused.has(id) || lifted);
      if (level === "near") {
        if (!visual.anatomy) {
          visual.anatomy = this.buildAnatomy(visual);
          visual.anatomy.position.copyFrom(visual.sprite.position);
          this.container.addChild(visual.anatomy);
        }
        visual.anatomy.visible = true;
      } else if (visual.anatomy) {
        visual.anatomy.visible = false;
      }
      const recede = this.highlight && !lifted ? RECEDE_ALPHA : 1;
      visual.sprite.alpha = freshnessAlpha(visual.node.dates?.modified, now) * recede;
      if (visual.anatomy) visual.anatomy.alpha = recede;
    }
  }

  /** Visibility fade/shrink pass from the VisibilityTracker sample (G3.f). */
  applyVisibility(
    progress: ReadonlyMap<string, number>,
    settledVisible: ReadonlySet<string>,
    now: number,
  ): void {
    for (const [id, visual] of this.visuals) {
      const p = progress.get(id) ?? (settledVisible.has(id) ? 1 : 0);
      const base = freshnessAlpha(visual.node.dates?.modified, now);
      visual.sprite.visible = p > 0;
      visual.sprite.alpha = base * p;
      const size = nodeRadius(visual.node) * 2 * (0.6 + 0.4 * p);
      visual.sprite.setSize(size, size);
      if (visual.anatomy) {
        visual.anatomy.visible = visual.anatomy.visible && p > 0;
        visual.anatomy.alpha = p;
      }
    }
  }

  /** For hit-testing and island anchoring. */
  positionOf(id: string): { x: number; y: number } | undefined {
    const v = this.visuals.get(id);
    return v ? { x: v.sprite.position.x, y: v.sprite.position.y } : undefined;
  }

  get count(): number {
    return this.visuals.size;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.visuals.clear();
  }

  // --- anatomy construction ---------------------------------------------------

  private buildAnatomy(visual: NodeVisual): Container {
    const anatomy = new Container();
    this.populateAnatomy(anatomy, visual.node);
    return anatomy;
  }

  private rebuildAnatomy(visual: NodeVisual): void {
    if (!visual.anatomy) return;
    visual.anatomy.removeChildren().forEach((c) => c.destroy());
    this.populateAnatomy(visual.anatomy, visual.node);
  }

  private populateAnatomy(anatomy: Container, node: SceneNodeData): void {
    // Text colours resolved from the token layer so they read on both light
    // and dark canvas backgrounds.
    const inkColor = getCssColor("--color-ink", 0x2b2620);
    const inkMuted = getCssColor("--color-ink-muted", 0x6a6258);

    // Anatomy rides the node's own radius so a large feature convergence does
    // not bury its ring, badges, and label inside the silhouette.
    const ringRadius = nodeRadius(node) + 3;
    const fraction = progressFraction(node.lifecycle);
    if (fraction !== null) {
      // The progress ring is a parametric arc-fill primitive (S36), not an
      // icon: exact done/total arc anchored at 12 o'clock, tinted with state.
      const ring = drawProgressRing(new Graphics(), fraction, {
        radius: ringRadius,
        width: 2,
        color: stateColor(node.lifecycle),
      });
      anatomy.addChild(ring);
    }
    const badges = tierBadgeText(node.degreeByTier);
    if (badges) {
      const badgeText = new Text({
        text: badges,
        style: { fontSize: 8, fill: inkMuted },
      });
      badgeText.position.set(ringRadius + 2, -ringRadius);
      anatomy.addChild(badgeText);
    }
    const label = new Text({
      text: node.title ?? node.id,
      style: { fontSize: 10, fill: inkColor },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, ringRadius + 3);
    anatomy.addChild(label);
  }
}
