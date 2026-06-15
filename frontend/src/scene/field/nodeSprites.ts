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
import { type StampDescriptor, stampFor, stampToken } from "./statusStamp";
import { cssColorNumber as getCssColor } from "./tokenReads";

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

// --- status stamp (node-visual-richness P03) ----------------------------------
//
// The rule of one: exactly ONE status treatment per node at field LOD. Type
// stays on the silhouette (the glyph), salience on size, and status is the one
// stamp — a grayscale-safe SHAPE (ring weight / ghost dim / slash / severity dot
// / tier notch). Tint (read through the SAME getCssColor seam as state colour)
// only ever REINFORCES the shape; it is never the load-bearing channel.

/** Alpha floor a ghosted (retired/archived/superseded) silhouette dims to. */
export const GHOST_ALPHA = 0.4;

/** Resolve the reinforcing stamp tint for a descriptor's class, through the
 *  same CSS-token seam state colour uses (literal hex per theme; the node test
 *  env sees the muted-ink fallback). */
export function stampColor(node: SceneNodeData): number {
  const token = stampToken(node.status?.class);
  return getCssColor(token, getCssColor("--color-ink-muted", 0x6a6258));
}

/**
 * The COARSE status treatment — what shows at FAR LOD (and near): the outline
 * ring (solid/dashed), the slash, and the ghost flag. These read as a single
 * silhouette-level mark without needing the exact magnitude. `none`/absent ring
 * is normalized to undefined so the caller draws nothing.
 */
export interface CoarseStamp {
  ring?: "solid" | "dashed";
  slash: boolean;
  ghost: boolean;
}

export function coarseStamp(stamp: StampDescriptor): CoarseStamp {
  return {
    ring: stamp.ring && stamp.ring !== "none" ? stamp.ring : undefined,
    slash: stamp.slash,
    ghost: stamp.ghost,
  };
}

/**
 * The FINE status treatment — what unfolds only at NEAR LOD / focus: the exact
 * severity-dot fill level (graded 1..4) and the exact tier-notch step
 * (tiered 1..4). Returns the mark id to rasterize through the glyph provider, or
 * null when the descriptor carries no fine magnitude. The two are mutually
 * exclusive (a node is graded OR tiered, never both — the rule of one).
 */
export function fineStampMarkId(stamp: StampDescriptor): string | null {
  if (stamp.severityDot && stamp.severityDot >= 1) {
    return `status-severity-${stamp.severityDot}`;
  }
  if (stamp.tierNotch && stamp.tierNotch >= 1) {
    return `status-tier-${stamp.tierNotch}`;
  }
  return null;
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
  /**
   * Texture for any mark by its stable id (tier/state/event/status-stamp) —
   * the badge/stamp path. Optional: the `DomainGlyphs` provider implements it
   * (the gate-cleared domain family); a placeholder/fallback provider may omit
   * it, in which case the fine status stamp simply does not render (the coarse
   * ring/slash/ghost still does). Mirrors the locked-seam additive discipline.
   */
  textureForMark?(id: string): Texture;
  /** Release cached GPU textures; called by the field on teardown. */
  destroy?(): void;
}

const NODE_RADIUS = 6;
/** The salience multiplier band: salience 0 -> 1.0x base; salience 1 -> this. */
export const SALIENCE_RADIUS_MAX = 2.6;

/**
 * World-space radius for a node, driven by salience (graph-representation ADR
 * encoding map: salience -> size, "making the importance field visible").
 *
 * salience -> size SUPERSEDES the old member-count radius rule (node-canvas
 * amendment, graph-representation W04.P11): member-count now folds into a feature
 * node's salience upstream, so the two channels no longer compete. When salience
 * is present it drives the radius for EVERY species (the importance field is the
 * size signal). When salience is ABSENT (an origin that does not yet serve it),
 * the prior rule is the fallback: feature-convergence nodes scale by member-count
 * (the constellation centers of gravity), every other species keeps the base
 * radius (shape carries type, not size, §3.1).
 */
export function nodeRadius(node: SceneNodeData): number {
  if (typeof node.salience === "number") {
    const s = Math.max(0, Math.min(1, node.salience));
    return NODE_RADIUS * (1 + s * (SALIENCE_RADIUS_MAX - 1));
  }
  // Fallback (salience absent): the prior member-count rule (node-canvas D4.1).
  if (node.kind !== "feature" || !node.memberCount || node.memberCount <= 0) {
    return NODE_RADIUS;
  }
  return NODE_RADIUS * (1.4 + Math.log2(1 + node.memberCount) * 0.5);
}

/**
 * Label priority for the DOI label cull (graph-representation ADR: salience is a
 * label-priority input). Higher = labelled sooner as the field declutters.
 * Focused/pinned/lifted nodes are always labelled (handled by the LOD pass); this
 * orders the AMBIENT field. Salience is the primary signal; member-count breaks
 * ties for feature nodes when salience is absent.
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

interface NodeVisual {
  node: SceneNodeData;
  sprite: Sprite;
  /**
   * The COARSE status stamp (node-visual-richness P03): the outline ring +
   * slash drawn just outside the silhouette. Rendered at ALL LOD (the coarse
   * treatment survives the far field), so it lives beside the sprite, not inside
   * the near-only anatomy. Null when the node carries no ring/slash stamp.
   */
  stamp: Graphics | null;
  /** Lazily built full anatomy (ring, badges, label, fine status dot/notch) —
   *  near LOD only. */
  anatomy: Container | null;
  /** The label Text within the anatomy, kept for DOI label-priority culling. */
  label: Text | null;
}

/**
 * Ambient label-priority floor by zoom (graph-representation label-priority cull):
 * at low ambient zoom only the highest-salience nodes label; the floor relaxes as
 * the user zooms in, until at the near threshold every near node labels. Focused,
 * pinned, and lifted nodes always label regardless (handled in `refresh`).
 */
export function ambientLabelFloor(scale: number): number {
  // scale below NEAR_ZOOM_THRESHOLD: no ambient labels (caller already gates by
  // LOD). Between NEAR and 1.6, relax linearly from 0.6 down to 0.
  if (scale >= 1.6) return 0;
  if (scale <= NEAR_ZOOM_THRESHOLD) return 0.6;
  const t = (scale - NEAR_ZOOM_THRESHOLD) / (1.6 - NEAR_ZOOM_THRESHOLD);
  return 0.6 * (1 - t);
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
        visual = { node, sprite, stamp: null, anatomy: null, label: null };
        this.visuals.set(node.id, visual);
      }
      visual.node = node;
      // Glyph textures are supersampled; sprites draw at node size in world
      // units regardless of texture resolution. Feature nodes scale with
      // their convergence weight (nodeRadius).
      const radius = nodeRadius(node);
      visual.sprite.setSize(radius * 2, radius * 2);
      // The status stamp is the SINGLE status treatment (rule of one): a ghost
      // node drops its silhouette to the retired/archived token and dims to the
      // ghost floor (handled in refresh's alpha math); every other class keeps
      // the state colour. Type stays on the silhouette, status on the stamp.
      const stamp = stampFor(node.status);
      visual.sprite.tint = stamp.ghost
        ? getCssColor("--color-state-archived", 0x9a938a)
        : stateColor(node.lifecycle);
      visual.sprite.alpha = freshnessAlpha(node.dates?.modified, now);
      this.rebuildStamp(visual, stamp);
      if (visual.anatomy) this.rebuildAnatomy(visual);
    }
    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        visual.sprite.destroy();
        visual.stamp?.destroy();
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
      visual.stamp?.position.set(p.x, p.y);
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
        // DOI label-priority cull (graph-representation node-canvas amendment):
        // focused/pinned/lifted nodes always label; the ambient field labels by
        // `salience` priority against a zoom-relaxing floor, so the overview never
        // becomes a hairball of text.
        if (visual.label) {
          const always = this.focused.has(id) || lifted;
          visual.label.visible =
            always || labelPriority(visual.node) >= ambientLabelFloor(this.lastScale);
        }
      } else if (visual.anatomy) {
        visual.anatomy.visible = false;
      }
      const recede = this.highlight && !lifted ? RECEDE_ALPHA : 1;
      // A ghosted (retired/archived/superseded) node dims to the ghost floor —
      // the single status treatment for the retired family — on top of the
      // freshness + recede multipliers.
      const ghost = stampFor(visual.node.status).ghost ? GHOST_ALPHA : 1;
      visual.sprite.alpha =
        freshnessAlpha(visual.node.dates?.modified, now) * recede * ghost;
      if (visual.stamp) visual.stamp.alpha = recede * ghost;
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
      const ghost = stampFor(visual.node.status).ghost ? GHOST_ALPHA : 1;
      visual.sprite.visible = p > 0;
      visual.sprite.alpha = base * p * ghost;
      const size = nodeRadius(visual.node) * 2 * (0.6 + 0.4 * p);
      visual.sprite.setSize(size, size);
      if (visual.stamp) {
        visual.stamp.visible = p > 0;
        visual.stamp.alpha = p * ghost;
      }
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

  // --- status stamp construction (coarse: ring + slash, all LOD) --------------

  /**
   * (Re)build the COARSE status stamp — the outline ring (solid/dashed) just
   * outside the silhouette and the slash diagonal — as a `Graphics` beside the
   * sprite so it survives the far field (the coarse treatment is LOD-stable).
   * The fine severity-dot / tier-notch unfolds only at near LOD in the anatomy.
   * Tint reinforces through the stampColor seam; shape carries. A descriptor
   * with no coarse mark (a bare graded/tiered/affirmed-without-ring node) tears
   * down any existing stamp and draws nothing.
   */
  private rebuildStamp(visual: NodeVisual, stamp: StampDescriptor): void {
    const coarse = coarseStamp(stamp);
    if (!coarse.ring && !coarse.slash) {
      visual.stamp?.destroy();
      visual.stamp = null;
      return;
    }
    let g = visual.stamp;
    if (!g) {
      g = new Graphics();
      this.container.addChild(g);
      g.position.copyFrom(visual.sprite.position);
      visual.stamp = g;
    } else {
      g.clear();
    }
    const color = stampColor(visual.node);
    const r = nodeRadius(visual.node) + 2;
    if (coarse.ring === "solid") {
      g.circle(0, 0, r).stroke({ width: 1.5, color });
    } else if (coarse.ring === "dashed") {
      // A dashed ring as eight round-capped arc segments (Pixi has no native
      // dash): the segmented silhouette reads "provisional" by shape alone.
      const seg = (2 * Math.PI) / 8;
      for (let i = 0; i < 8; i += 2) {
        const a0 = -Math.PI / 2 + i * seg;
        g.arc(0, 0, r, a0, a0 + seg).stroke({ width: 1.5, color });
      }
    }
    if (coarse.slash) {
      // A bold single diagonal strike-through (negated / superseded).
      const d = r + 1;
      g.moveTo(-d, d).lineTo(d, -d).stroke({ width: 2, color });
    }
  }

  // --- anatomy construction ---------------------------------------------------

  private buildAnatomy(visual: NodeVisual): Container {
    const anatomy = new Container();
    visual.label = this.populateAnatomy(anatomy, visual.node);
    return anatomy;
  }

  private rebuildAnatomy(visual: NodeVisual): void {
    if (!visual.anatomy) return;
    visual.anatomy.removeChildren().forEach((c) => c.destroy());
    visual.label = this.populateAnatomy(visual.anatomy, visual.node);
  }

  private populateAnatomy(anatomy: Container, node: SceneNodeData): Text {
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
    // The FINE status stamp (node-visual-richness P03): the exact severity-dot
    // fill level (graded) and tier-notch step (tiered) unfold ONLY here at near
    // LOD / focus — the coarse ring/slash already showed in the far field. Drawn
    // through the glyph provider's textureForMark so the gate-cleared status
    // marks render as a small positioned, tinted sprite. Severity sits at ~4-5
    // o'clock, tier at ~7-8 o'clock (mutually exclusive by the rule of one).
    const fineMark = fineStampMarkId(stampFor(node.status));
    if (fineMark && this.glyphs.textureForMark) {
      const dot = new Sprite(this.glyphs.textureForMark(fineMark));
      dot.anchor.set(0.5);
      const size = Math.max(6, nodeRadius(node) * 0.9);
      dot.setSize(size, size);
      dot.tint = stampColor(node);
      const isSeverity = fineMark.startsWith("status-severity");
      // 4-5 o'clock (down-right) for severity; 7-8 o'clock (down-left) for tier.
      const angle = isSeverity ? Math.PI / 4 : (3 * Math.PI) / 4;
      const dist = nodeRadius(node) + size * 0.5;
      dot.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist);
      anatomy.addChild(dot);
    }
    const label = new Text({
      text: node.title ?? node.id,
      style: { fontSize: 10, fill: inkColor },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, ringRadius + 3);
    anatomy.addChild(label);
    return label;
  }
}
