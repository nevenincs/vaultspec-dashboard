// Node sprite layer — the binding Node-items frame (graph/Node-items 83:2,
// graph/Hero 85:2; figma-parity-reconciliation W03.P07.S42). Scene-layer module:
// framework-free by design — no React imports, ever.
//
// THE NODE (graph/Node-items 83:2 — binding): a PLAIN FILLED CIRCLE coloured by
// document category and sized by the engine-served salience, with a clean meta-
// size label below. Colour is the TYPE channel; size carries IMPORTANCE; the
// concentric accent ring carries SELECTION. Exactly THREE states, and nothing
// else on the disc:
//   - DEFAULT      a crisp full-opacity category circle (no freshness dimming,
//                  no status stamp — the clean instrument register).
//   - SELECTED     the circle PLUS a thin concentric single-accent ring.
//   - FILTERED-OUT the circle fades toward transparent and shrinks slightly
//                  (the receding "hidden" treatment).
//
// This SUPERSEDES, ON THE CANVAS BODY, the per-doc-type silhouette mark and the
// node-visual-richness status STAMP overlays (Figma is binding). The silhouette
// marks (`marks.ts`) and the status DATA survive untouched for the chrome /
// legend / hover-card / inspector — colour is the on-canvas type channel, size
// carries salience, the ring carries selection, and the full status reads off
// the canvas. The single surviving on-canvas status treatment is CIRCLE-LEVEL: a
// ghost (retired/archived/superseded) node desaturates its disc to the archived
// neutral and dims to the ghost floor, matching the Hero's "filtered-out /
// archived" look — a property of the circle, not a stamp overlay.
//
// LOD discipline (the anti-hairball rule): the zoomed-out field draws only the
// coloured circle; the label + full anatomy (progress ring, tier badges) unfold
// above the near-zoom threshold and for focused nodes.
//
// FROZEN CONTRACT: this layer receives its node set only through the field
// assembly's command path (set-data / set-selected / set-visibility, all on the
// locked SceneCommand union) and emits nothing — selection/hover flow back
// through the controller's event channel elsewhere (dashboard-layer-ownership).

import { Container, Graphics, Text, Texture } from "pixi.js";

import type { SceneGraphModel } from "../graphModel";
import type { SceneNodeData } from "../sceneController";
import { categoryColor } from "./categoryColor";
import { RECEDE_ALPHA, selectedRingAlpha } from "./egoHighlight";
import { drawProgressRing } from "./progressRing";
import { stampFor } from "./statusStamp";
import { cssColorNumber as getCssColor } from "./tokenReads";

// --- pure anatomy helpers (unit-tested; rendering maps these) ---------------

export type LodLevel = "far" | "near";

/** World-scale threshold above which the label + full anatomy unfold. Set to the
 * feature LOD (0.6) so labels show in the default fit-to-view, matching the
 * Obsidian mental model where the graph labels at overview scale. */
export const NEAR_ZOOM_THRESHOLD = 0.6;

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

// --- circle-level status treatment (the one surviving canvas status signal) ---
//
// The canvas draws no status STAMP overlays (Hero redesign). The one status
// treatment that survives on the canvas is CIRCLE-LEVEL: a ghost
// (retired/archived/superseded) node desaturates its disc to the archived
// neutral (`bodyColor`) and dims to this floor — the Hero's filtered-out /
// archived look. The full status (severity/tier/value) reads off the canvas.

/** Alpha floor a ghosted (retired/archived/superseded) node disc dims to. */
export const GHOST_ALPHA = 0.4;

// Freshness is retained as a PURE helper (consumed by callers that still want a
// recency signal off the canvas body) but is NO LONGER applied to the default
// node disc: the binding Node-items frame shows the default state as a crisp,
// full-opacity category circle, so dimming it by age would muddy the clean
// three-state model. The body alpha is driven only by the three states (default
// 1, selected 1, filtered-out fade) plus the ghost floor and the ego recede.

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

// --- the sprite layer ---------------------------------------------------------

/** Supplies silhouette textures per node kind. Retained as the chrome/legend/
 *  hover-card mark seam (`domainGlyphs.ts` implements it); the canvas BODY no
 *  longer draws glyphs (it is a category circle), so this layer does not consume
 *  it — the seam stays for the React MarkById path. */
export interface GlyphTextureProvider {
  textureFor(kind: string): Texture;
  /** Texture for any mark by stable id (tier/state/event/status-stamp). */
  textureForMark?(id: string): Texture;
  /** Release cached GPU textures; called by the field on teardown. */
  destroy?(): void;
}

/** Base node-disc radius (graph/Node-items: a ~12px-diameter dot at unit scale). */
const NODE_RADIUS = 6;
/** Salience multiplier band: salience 0 -> 1.0x base; salience 1 -> this. */
export const SALIENCE_RADIUS_MAX = 2.6;

// --- selected-state ring geometry (graph/Node-items 83:2 "selected") ----------
//
// The selected node is the filled circle PLUS a thin concentric accent ring with
// a clear gap, read from the Figma "selected" swatch (a ~22px disc, ~2.5px gap, a
// ~1.5px ring within the 34px node box). Expressed relative to the body radius so
// it scales with salience: ring centre at r + GAP + STROKE/2, stroked at STROKE.
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
//
// The binding default disc reads as a solid category fill that sits crisply on
// the connection-field ground: a filled circle with a faint, slightly darker
// hairline at its edge that gives the disc weight and separates it from the flat-
// grey edges and from a same-category neighbour. The rim is an IN-FAMILY shade of
// the body's OWN hue — a darkened variant, never a second accent and never a
// borrowed neutral (warmth-lives-in-tokens-not-decoration: warmth in one hue, no
// decoration). It is a property of the DEFAULT circle, present in every state so
// the disc keeps its edge under selection and the ego-recede.

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
 * World-space radius for a node, driven by the engine-served salience
 * (degree-of-interest). Salience is the importance field made visible: it drives
 * the radius for EVERY species, monotonic in [0,1] and capped at the documented
 * band. When salience is ABSENT (an origin that does not yet serve it), the prior
 * rule is the honest fallback: feature-convergence nodes scale by member-count
 * (the constellation centres of gravity); every other species keeps the base
 * radius (shape carries type, not size, §3.1).
 */
export function nodeRadius(node: SceneNodeData): number {
  if (typeof node.salience === "number") {
    const s = Math.max(0, Math.min(1, node.salience));
    return NODE_RADIUS * (1 + s * (SALIENCE_RADIUS_MAX - 1));
  }
  if (node.kind !== "feature" || !node.memberCount || node.memberCount <= 0) {
    return NODE_RADIUS;
  }
  return NODE_RADIUS * (1.4 + Math.log2(1 + node.memberCount) * 0.5);
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
 * salience nodes label; the floor relaxes as the user zooms in, until at the
 * near threshold every near node labels. Focused/pinned/lifted nodes always
 * label regardless (handled in `refresh`).
 */
export function ambientLabelFloor(scale: number): number {
  if (scale >= 1.6) return 0;
  if (scale <= NEAR_ZOOM_THRESHOLD) return 0.6;
  const t = (scale - NEAR_ZOOM_THRESHOLD) / (1.6 - NEAR_ZOOM_THRESHOLD);
  return 0.6 * (1 - t);
}

interface NodeVisual {
  node: SceneNodeData;
  /**
   * The node BODY — a category-coloured filled circle (graph/Hero 85:2). A
   * `Graphics` (not a `Sprite`) so the disc is crisp at any camera scale;
   * redrawn only when the radius/colour changes, not per frame (position is a
   * cheap transform).
   */
  body: Graphics;
  /**
   * The selected-state accent ring (graph/Node-items 83:2 "selected"): a thin
   * concentric ring with a clear gap, drawn only while this node is selected.
   * Null otherwise.
   */
  ring: Graphics | null;
  /** Lazily built near-LOD anatomy (progress ring, tier badges, label). */
  anatomy: Container | null;
  /** The label Text within the anatomy, kept for DOI label-priority culling. */
  label: Text | null;
  /** Last drawn body radius/colour, so sync only redraws the circle on change. */
  drawnRadius: number;
  drawnColor: number;
}

export class NodeSpriteLayer {
  private container = new Container();
  private visuals = new Map<string, NodeVisual>();
  private focused = new Set<string>();
  /** Currently selected node ids (graph/Node-items "selected"): each draws the
   *  concentric accent ring. Driven by the `set-selected` seam command. */
  private selected = new Set<string>();
  private lastScale = 1;
  private highlight: ReadonlySet<string> | null = null;

  constructor(world: Container) {
    world.addChild(this.container);
  }

  /** Reconcile node bodies against the model by stable id. */
  sync(model: SceneGraphModel, _now: number): void {
    const seen = new Set<string>();
    for (const node of model.nodes) {
      seen.add(node.id);
      let visual = this.visuals.get(node.id);
      if (!visual) {
        const body = new Graphics();
        this.container.addChild(body);
        visual = {
          node,
          body,
          ring: null,
          anatomy: null,
          label: null,
          drawnRadius: -1,
          drawnColor: -1,
        };
        this.visuals.set(node.id, visual);
      }
      visual.node = node;
      // The body is a category-coloured filled circle (graph/Hero): colour is the
      // TYPE channel, size carries salience. Redraw the disc only when the radius
      // or colour actually changes — position is a cheap per-frame transform.
      const radius = nodeRadius(node);
      const color = bodyColor(node);
      if (radius !== visual.drawnRadius || color !== visual.drawnColor) {
        // The DEFAULT disc (graph/Node-items "default"): a solid category fill
        // with a faint in-family hairline rim that gives the circle weight on the
        // connection-field ground and separates it from a same-category neighbour.
        // The rim rides the body's own hue (darkened), so it tracks the theme and
        // the ghost desaturation without a second accent.
        visual.body
          .clear()
          .circle(0, 0, radius)
          .fill({ color })
          .stroke({ width: BODY_RIM_WIDTH, color: bodyRimColor(color), alignment: 1 });
        visual.drawnRadius = radius;
        visual.drawnColor = color;
        if (visual.ring) this.drawRing(visual);
      }
      // DEFAULT state (binding Node-items): a crisp, full-opacity category circle.
      // The ghost (retired/archived) circle-level treatment is the one status
      // signal that dims the disc; the ego recede + filtered-out fade are applied
      // by `refresh`/`applyVisibility`. Freshness no longer dims the default disc.
      visual.body.alpha = this.ghostFloor(node);
      this.syncRing(visual);
      if (visual.anatomy) this.rebuildAnatomy(visual);
    }
    for (const [id, visual] of this.visuals) {
      if (!seen.has(id)) {
        visual.body.destroy();
        visual.ring?.destroy();
        visual.anatomy?.destroy({ children: true });
        this.visuals.delete(id);
      }
    }
  }

  /** The ghost floor for a node: GHOST_ALPHA for a retired/archived/superseded
   *  node (the one circle-level status treatment), else fully opaque. */
  private ghostFloor(node: SceneNodeData): number {
    return stampFor(node.status).ghost ? GHOST_ALPHA : 1;
  }

  /** Set the selected node ids (graph/Node-items "selected"): each gains the
   *  concentric accent ring; deselected nodes drop it. Driven by `set-selected`
   *  (dashboard-layer-ownership: data in via the command channel only). */
  setSelected(ids: ReadonlySet<string>): void {
    this.selected = new Set(ids);
    for (const visual of this.visuals.values()) this.syncRing(visual);
  }

  /** Add/remove the selected ring for one visual against the selected set. */
  private syncRing(visual: NodeVisual): void {
    const want = this.selected.has(visual.node.id);
    if (want && !visual.ring) {
      const ring = new Graphics();
      // The ring sits above the body in z (added after its body); it reads as a
      // halo around the disc.
      this.container.addChild(ring);
      ring.position.copyFrom(visual.body.position);
      visual.ring = ring;
      this.drawRing(visual);
    } else if (!want && visual.ring) {
      visual.ring.destroy();
      visual.ring = null;
    }
  }

  /** (Re)draw the selected accent ring for a visual at its body radius. */
  private drawRing(visual: NodeVisual): void {
    if (!visual.ring) return;
    const r = selectedRingRadius(nodeRadius(visual.node));
    visual.ring
      .clear()
      .circle(0, 0, r)
      .stroke({ width: SELECTED_RING_WIDTH, color: selectedRingColor() });
  }

  /** Per-frame position pass (layout worker output / cached positions). */
  updatePositions(
    positionOf: (id: string) => { x: number; y: number } | undefined,
  ): void {
    for (const [id, visual] of this.visuals) {
      const p = positionOf(id);
      if (!p) continue;
      visual.body.position.set(p.x, p.y);
      visual.ring?.position.set(p.x, p.y);
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
   * Ego-highlight (G3.b): lifted ids keep full alpha and show labels at any zoom
   * (DOI culling); the rest of the field recedes. Null clears.
   */
  setHighlight(lifted: ReadonlySet<string> | null): void {
    this.highlight = lifted;
    this.refresh();
  }

  /** Re-apply LOD + highlight to every visual. */
  private refresh(): void {
    for (const visual of this.visuals.values()) {
      const id = visual.node.id;
      const lifted = this.highlight?.has(id) ?? false;
      const level = lodFor(this.lastScale, this.focused.has(id) || lifted);
      if (level === "near") {
        if (!visual.anatomy) {
          visual.anatomy = this.buildAnatomy(visual);
          visual.anatomy.position.copyFrom(visual.body.position);
          this.container.addChild(visual.anatomy);
        }
        visual.anatomy.visible = true;
        // DOI label-priority cull: focused/pinned/lifted nodes always label; the
        // ambient field labels by salience against a zoom-relaxing floor, so the
        // overview never becomes a hairball of text.
        if (visual.label) {
          const always = this.focused.has(id) || lifted;
          visual.label.visible =
            always || labelPriority(visual.node) >= ambientLabelFloor(this.lastScale);
        }
      } else if (visual.anatomy) {
        visual.anatomy.visible = false;
      }
      // Body alpha = the three-state model: default/selected crisp (1), the
      // ego-recede dims the non-lifted field while an ego is held, and the ghost
      // floor caps a retired node. The filtered-out fade is applied separately by
      // `applyVisibility`.
      const egoHeld = this.highlight !== null;
      const recede = egoHeld && !lifted ? RECEDE_ALPHA : 1;
      visual.body.alpha = recede * this.ghostFloor(visual.node);
      // The SELECTED ring is the single persistent accent (graph/Node-items
      // "selected"): it never dissolves into the receded field the way a body
      // does. A selected node that is itself lifted keeps a full ring; a selected
      // node outside a held ego holds the legibility FLOOR (above the body
      // recede), so the selection stays visible. It never follows the ghost floor
      // (a selected retired node still shows a clear ring).
      if (visual.ring) visual.ring.alpha = selectedRingAlpha(egoHeld, lifted);
      if (visual.anatomy) visual.anatomy.alpha = recede;
    }
  }

  /** Visibility fade/shrink pass from the VisibilityTracker sample (G3.f): the
   *  FILTERED-OUT state (graph/Node-items "Hidden") fades the body toward
   *  transparent and shrinks it slightly so the removed set reads as receding,
   *  not vanishing abruptly. */
  applyVisibility(
    progress: ReadonlyMap<string, number>,
    settledVisible: ReadonlySet<string>,
    _now: number,
  ): void {
    for (const [id, visual] of this.visuals) {
      const p = progress.get(id) ?? (settledVisible.has(id) ? 1 : 0);
      const ghost = this.ghostFloor(visual.node);
      visual.body.visible = p > 0;
      visual.body.alpha = p * ghost;
      visual.body.scale.set(0.6 + 0.4 * p);
      if (visual.ring) {
        visual.ring.visible = p > 0;
        visual.ring.alpha = p;
        visual.ring.scale.set(0.6 + 0.4 * p);
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
    return v ? { x: v.body.position.x, y: v.body.position.y } : undefined;
  }

  get count(): number {
    return this.visuals.size;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.visuals.clear();
  }

  // --- near-LOD anatomy construction ------------------------------------------

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
    // Anatomy text reads in the ink-muted scene token on both light and dark
    // grounds.
    const inkMuted = getCssColor("--color-ink-muted", 0x6a6258);

    // Anatomy rides the node's own radius so a large feature convergence does not
    // bury its ring, badges, and label inside the disc.
    const ringRadius = nodeRadius(node) + 3;
    const fraction = progressFraction(node.lifecycle);
    if (fraction !== null) {
      // The progress ring is a parametric arc-fill primitive: an exact done/total
      // arc anchored at 12 o'clock, tinted with the lifecycle state colour.
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
    // The label sits BELOW the circle in the ink-muted scene token at the small
    // meta size (graph/Hero: "Research notes" / "Clock decision" — ink-muted
    // meta). No on-canvas status stamp (Hero redesign): the near-LOD anatomy
    // carries only the progress ring, the tier-degree badges, and the label.
    const label = new Text({
      text: node.title ?? node.id,
      style: { fontSize: 10, fill: inkMuted },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, ringRadius + 3);
    anatomy.addChild(label);
    return label;
  }
}
