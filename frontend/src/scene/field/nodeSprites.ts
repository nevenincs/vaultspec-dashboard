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
// The pure visual-anatomy helpers (radius, colour, LOD, label priority, …) live
// in `nodeAppearance.ts` (pixi-free); this file keeps the pixi-bound layer and
// imports them back.
//
// FROZEN CONTRACT: this layer receives its node set only through the field
// assembly's command path (set-data / set-selected / set-visibility, all on the
// locked SceneCommand union) and emits nothing — selection/hover flow back
// through the controller's event channel elsewhere (dashboard-layer-ownership).

import { Container, Graphics, Text, Texture } from "pixi.js";

import type { SceneGraphModel } from "../graphModel";
import type { SceneNodeData } from "../sceneController";
import { RECEDE_ALPHA, selectedRingAlpha } from "./egoHighlight";
import { filteredAlpha, filteredScale } from "../visibility";
import { drawProgressRing } from "./progressRing";
import { stampFor } from "./statusStamp";
import { cssColorNumber as getCssColor } from "./tokenReads";
import {
  BODY_RIM_WIDTH,
  GHOST_ALPHA,
  SELECTED_RING_WIDTH,
  ambientLabelFloor,
  bodyColor,
  bodyRimColor,
  labelPriority,
  labelResolution,
  lodFor,
  nodeRadius,
  progressFraction,
  selectedRingColor,
  selectedRingRadius,
  stateColor,
  tierBadgeText,
} from "./nodeAppearance";

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
      // The FILTERED-OUT state (graph/Node-items "Hidden"): fade toward
      // transparent AND shrink so the removed node reads as the field pulling
      // back, not popping out. The fade/shrink curve is owned by the visibility
      // module (one testable home); the body fade composes with the ghost floor.
      const fade = filteredAlpha(p);
      const scale = filteredScale(p);
      visual.body.visible = p > 0;
      visual.body.alpha = fade * ghost;
      visual.body.scale.set(scale);
      if (visual.ring) {
        visual.ring.visible = p > 0;
        visual.ring.alpha = fade;
        visual.ring.scale.set(scale);
      }
      if (visual.anatomy) {
        visual.anatomy.visible = visual.anatomy.visible && p > 0;
        visual.anatomy.alpha = fade;
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
        resolution: labelResolution(),
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
      resolution: labelResolution(),
      style: { fontSize: 10, fill: inkMuted },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, ringRadius + 3);
    anatomy.addChild(label);
    return label;
  }
}
