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

// --- pure anatomy helpers (unit-tested; rendering maps these) ---------------

export type LodLevel = "far" | "near";

/** World-scale threshold above which full anatomy unfolds (semantic zoom). */
export const NEAR_ZOOM_THRESHOLD = 1.6;

/** Focused nodes always carry full anatomy regardless of zoom (§3.1). */
export function lodFor(scale: number, focused: boolean): LodLevel {
  return focused || scale >= NEAR_ZOOM_THRESHOLD ? "near" : "far";
}

/**
 * State colours (interim palette pending the S47 token layer). Colour is
 * spent on state only; doc type rides the silhouette.
 */
const STATE_COLORS: Record<string, number> = {
  active: 0x2f7d4f,
  complete: 0x4a4137,
  archived: 0x9a938a,
  broken: 0xb3502d,
  stale: 0xc28e2d,
};
const DEFAULT_STATE_COLOR = 0x6a6258;

export function stateColor(lifecycle?: SceneNodeData["lifecycle"]): number {
  if (!lifecycle) return DEFAULT_STATE_COLOR;
  return STATE_COLORS[lifecycle.state] ?? DEFAULT_STATE_COLOR;
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

/** Supplies silhouette textures per node kind (S16 placeholder set plugs in). */
export interface GlyphTextureProvider {
  textureFor(kind: string): Texture;
}

const NODE_RADIUS = 6;
const RING_RADIUS = NODE_RADIUS + 3;

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
        // Glyph textures are supersampled; sprites draw at node size in
        // world units regardless of texture resolution.
        sprite.setSize(NODE_RADIUS * 2, NODE_RADIUS * 2);
        this.container.addChild(sprite);
        visual = { node, sprite, anatomy: null };
        this.visuals.set(node.id, visual);
      }
      visual.node = node;
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
    for (const visual of this.visuals.values()) {
      const level = lodFor(scale, this.focused.has(visual.node.id));
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
    }
  }

  /** Visibility fade/shrink pass from the VisibilityTracker sample (G3.f). */
  applyVisibility(
    progress: ReadonlyMap<string, number>,
    settledVisible: ReadonlySet<string>,
  ): void {
    for (const [id, visual] of this.visuals) {
      const p = progress.get(id) ?? (settledVisible.has(id) ? 1 : 0);
      const base = freshnessAlpha(visual.node.dates?.modified, Date.now());
      visual.sprite.visible = p > 0;
      visual.sprite.alpha = base * p;
      const size = NODE_RADIUS * 2 * (0.6 + 0.4 * p);
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
    const fraction = progressFraction(node.lifecycle);
    if (fraction !== null) {
      const ring = new Graphics();
      ring
        .arc(0, 0, RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * fraction)
        .stroke({ width: 2, color: stateColor(node.lifecycle) });
      anatomy.addChild(ring);
    }
    const badges = tierBadgeText(node.degreeByTier);
    if (badges) {
      const badgeText = new Text({
        text: badges,
        style: { fontSize: 8, fill: 0x4a4137 },
      });
      badgeText.position.set(RING_RADIUS + 2, -RING_RADIUS);
      anatomy.addChild(badgeText);
    }
    const label = new Text({
      text: node.title ?? node.id,
      style: { fontSize: 10, fill: 0x2b2620 },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, RING_RADIUS + 3);
    anatomy.addChild(label);
  }
}
