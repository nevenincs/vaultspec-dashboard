import { type SceneNodeData } from "../../sceneController";
import { nodeWorldRadius } from "../appearance";
import { uiScale } from "../uiScale";
import {
  FENCE_FILL_ALPHA,
  FENCE_PAD_PX,
  FENCE_STROKE_ALPHA,
  FENCE_STROKE_WIDTH_PX,
  FOCUS_RING_WIDTH_PX,
  LABEL_BUDGET,
  LABEL_MAX_WIDTH_PX,
  LABEL_PILL_GAP_PX,
  LABEL_PILL_PAD_X_PX,
  LABEL_PILL_PAD_Y_PX,
  PULSE_RING_ALPHA,
  PULSE_RING_WIDTH,
} from "./config";
import {
  convexHull,
  sanitizeLabel,
  traceRoundedOffset,
  type ScreenPt,
} from "./geometry";
import { ThreeFieldSimulation } from "./simulation";
export abstract class ThreeFieldOverlay extends ThreeFieldSimulation {
  // --- anchors (RL-4: DOM islands + hover card) ----------------------------

  /** For every node a consumer is tracking (opened islands, hover card), emit its
   *  screen-space anchor each render so the DOM overlay follows it; emit null when
   *  the node is gone or off the viewport so the overlay hides. Mirrors CosmosField's
   *  per-frame trackedNodeIds → emitAnchor pass. */
  protected emitAnchors(): void {
    const ctrl = this.controller;
    if (!ctrl) return;
    const scale = this.camera.zoom;
    for (const id of ctrl.trackedNodeIds()) {
      const i = this.idToIndex.get(id);
      // A filtered-out node hides its DOM anchor (opened island / hover card) — the
      // same visibleNodeIds mask the ring + label passes honor (GS-004) — so an overlay
      // never floats over a node the filter has hidden. Selection/tracking survives the
      // filter (desirable); only the ghost anchor is suppressed, and it re-emits when the
      // filter releases the node — no state change.
      const masked = this.visibleNodeIds !== null && !this.visibleNodeIds.has(id);
      const p = i === undefined || masked ? null : this.worldToScreen(i);
      if (!p || p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) {
        ctrl.emitAnchor(id, null);
      } else {
        ctrl.emitAnchor(id, { x: p.x, y: p.y, scale });
      }
    }
  }

  /** One-shot anchor refresh when a consumer starts tracking a node (RL-4). */
  refreshAnchors(): void {
    this.emitAnchors();
  }

  // --- labels + rings (2D overlay) -----------------------------------------

  protected drawLabels(): void {
    const ctx = this.labelCtx;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.nodes.length === 0) return;

    // SGR-006: theme/scale-derived colours + label styles from the per-epoch cache.
    const {
      ink,
      accent,
      highlight,
      inkMuted,
      pillFill,
      pillBorder,
      featureStyle,
      docStyle,
    } = this.overlayTheme();
    const ppw = this.pixelsPerWorld();
    // Screen-px UI-scale: ring gaps, stroke widths, and label offsets track the DOM.
    const s = uiScale();
    // The active emphasis set (hover/selection) drives the focus/context split for the
    // glow + label colours below — recomputed once per draw.
    const focus = this.emphasisSet();

    // Cluster-selection perimeter fence (emphasis-state-grammar ADR) — drawn FIRST so
    // rings and labels layer above it.
    this.drawFence(ctx, accent, s, ppw);

    // Emphasis rings (under labels). Three theme-token treatments kept visually
    // distinct so hover, selection, and pin never read the same:
    //   • SELECTED — the dominant ring: ACCENT hue, thickness scaled as a
    //     MULTIPLIER of the node radius (floored 3.5px, capped 10px) + a wide gap.
    //   • HOVERED  — a thinner ring in the distinct theme HIGHLIGHT hue, so a
    //     transient hover never reads as a selection.
    //   • PINNED   — a thin dashed ACCENT ring (layout-fixed marker).
    // Precedence selected > hovered > pinned: a selected node keeps its strong
    // ring while hovered.
    for (let i = 0; i < this.nodes.length; i++) {
      const id = this.nodes[i].id;
      // A filtered-out node draws no emphasis ring (GS-004): the same visibleNodeIds
      // mask the label pass (labelVisible) and picking already honor, and the node body
      // scales to zero via aHidden. Selection/pin survives the filter (desirable) — only
      // the ghost ring over the hidden node is suppressed; it reappears when the filter
      // releases the node, no state change.
      if (this.visibleNodeIds && !this.visibleNodeIds.has(id)) continue;
      const selected = this.selectedIds.has(id);
      const hovered = this.hoveredId === id;
      const pinned = this.pinnedIds.has(id);
      const pulsed = this.pulseIds.has(id);
      if (!selected && !hovered && !pinned && !pulsed) continue;
      const p = this.worldToScreen(i);
      if (!p) continue;
      const nodeR = Math.max(
        3 * s,
        nodeWorldRadius(this.nodes[i], this.appearance) * ppw,
      );
      // Base emphasis ring (precedence selected > hovered > pinned). The hovered hub's
      // focus ring is the binding 2px ACCENT (graph/Hover); selected stays the dominant
      // (wider) accent ring, pinned a thin dashed accent marker.
      if (selected || hovered || pinned) {
        ctx.beginPath();
        if (selected) {
          ctx.arc(p.x, p.y, nodeR + 5 * s, 0, Math.PI * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = Math.min(10 * s, Math.max(3.5 * s, nodeR * 0.22));
        } else if (hovered) {
          ctx.arc(p.x, p.y, nodeR + 4 * s, 0, Math.PI * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = FOCUS_RING_WIDTH_PX * s;
        } else {
          ctx.arc(p.x, p.y, nodeR + 3 * s, 0, Math.PI * 2);
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5 * s;
          ctx.setLineDash([3 * s, 3 * s]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Transient pulse ring (additive flash in the highlight hue).
      if (pulsed) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeR + 8 * s, 0, Math.PI * 2);
        ctx.strokeStyle = highlight;
        ctx.lineWidth = PULSE_RING_WIDTH * s;
        ctx.globalAlpha = PULSE_RING_ALPHA;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Labels — typography from the CENTRALIZED design tokens (binding Figma
    // "graph/Label — Feature | Document"): feature = Label/12, document = Meta/11. Sizes
    // are rem-relative (resolved against the root font size in labelStyle) so canvas labels
    // scale with the DOM under one UI scale — never a hardcoded px. Labels appear ONLY on
    // interaction (hover / select / pin, per labelVisible) and render as a design PILL
    // (drawLabelPill) — there are no ambient always-on labels.
    ctx.textBaseline = "middle";
    // FPS-adaptive LOD: quarter the label clutter cap when frames are slow (updatePerfLod).
    let budget = this.perfDegraded
      ? Math.max(24, Math.floor(LABEL_BUDGET / 4))
      : LABEL_BUDGET; // clutter cap
    for (let i = 0; i < this.nodes.length && budget > 0; i++) {
      const node = this.nodes[i];
      if (!this.labelVisible(node)) continue;
      const p = this.worldToScreen(i);
      if (!p || p.x < -40 || p.x > this.width + 40 || p.y < 0 || p.y > this.height)
        continue;
      const r = Math.max(3 * s, nodeWorldRadius(node, this.appearance) * ppw);
      const isFeature = node.kind === "feature";
      const style = isFeature ? featureStyle : docStyle;
      ctx.font = style.font;
      // The label text is SANITIZED (whitespace collapsed, control chars stripped) and
      // elided to a FIXED character cap, then bounded to a screen width; the full title
      // lives in the DOM HoverCard.
      const text = this.fitLabel(
        ctx,
        sanitizeLabel(node.title ?? node.id),
        LABEL_MAX_WIDTH_PX * s,
      );
      // Label colour by focus membership while an emphasis is active (graph/Hover parity):
      // focus labels read in ink, context labels in the muted taupe. Off-emphasis, the
      // default feature=ink / document=ink-muted ramp applies.
      const labelInk = focus
        ? focus.has(node.id)
          ? ink
          : inkMuted
        : isFeature
          ? ink
          : inkMuted;
      // Every visible label is an interaction (hover / select / pin) and renders as the
      // design PILL — a rounded paper chip with a hairline border. There are no ambient
      // plate-less labels any more (the field never paints naked text without a hover).
      const x = p.x + r + LABEL_PILL_GAP_PX * s;
      this.drawLabelPill(
        ctx,
        x,
        p.y,
        text,
        style.sizePx,
        labelInk,
        pillFill,
        pillBorder,
        s,
      );
      budget--;
    }
    ctx.globalAlpha = 1;
  }

  /** Cluster-selection perimeter fence (emphasis-state-grammar ADR): the positive marker
   *  of the durable feature-cluster selection — a convex padded hull (rounded n-gon)
   *  traced around the spotlit cohort's on-screen positions, accent-token stroke over a
   *  whisper fill, its alpha riding the shared emphasis ease (fade in on select, fade out
   *  over the departing cohort on clear via the lagging `fenceTag`). Gates on the
   *  visibleNodeIds mask exactly as rings/anchors do (GS-004): a filtered-out member
   *  contributes no hull point and an all-hidden cohort draws no fence. Re-traced per
   *  frame so it tracks the live layout; the interior fill is skipped under perf
   *  degradation (the overlay pass is the FPS-sensitive path). */
  protected drawFence(
    ctx: CanvasRenderingContext2D,
    accentCss: string,
    s: number,
    ppw: number,
  ): void {
    if (this.fenceAlpha <= 0.01 || !this.fenceTag) return;
    const ids = new Set(this.featureCohort.get(this.fenceTag) ?? []);
    const featureNodeId = `feature:${this.fenceTag}`;
    if (this.idToIndex.has(featureNodeId)) ids.add(featureNodeId);
    const pts: ScreenPt[] = [];
    let maxR = 0;
    for (const id of ids) {
      const i = this.idToIndex.get(id);
      if (i === undefined) continue;
      if (this.visibleNodeIds && !this.visibleNodeIds.has(id)) continue;
      const p = this.worldToScreen(i);
      if (!p) continue;
      const r = Math.max(3 * s, nodeWorldRadius(this.nodes[i], this.appearance) * ppw);
      if (r > maxR) maxR = r;
      pts.push(p);
    }
    if (pts.length === 0) return;
    const pad = maxR + FENCE_PAD_PX * s;
    ctx.beginPath();
    traceRoundedOffset(ctx, convexHull(pts), pad);
    ctx.closePath();
    if (!this.perfDegraded) {
      ctx.globalAlpha = FENCE_FILL_ALPHA * this.fenceAlpha;
      ctx.fillStyle = accentCss;
      ctx.fill();
    }
    ctx.globalAlpha = FENCE_STROKE_ALPHA * this.fenceAlpha;
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = FENCE_STROKE_WIDTH_PX * s;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Draw an interactive label as a design PILL: a rounded, paper-filled chip with a
   *  hairline scene-rule border and the ink text centred inside, left-anchored at `x` and
   *  vertically centred on `y`. Padding/radius are UI-scaled. The chip's paper fill is
   *  opaque so it occludes the edges/nodes behind the text, keeping the focused label
   *  crisply legible above the field. */
  protected drawLabelPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    fontPx: number,
    inkCss: string,
    fillCss: string,
    borderCss: string,
    s: number,
  ): void {
    const padX = LABEL_PILL_PAD_X_PX * s;
    const padY = LABEL_PILL_PAD_Y_PX * s;
    const tw = ctx.measureText(text).width;
    const w = tw + padX * 2;
    const h = fontPx + padY * 2;
    const top = y - h / 2;
    const radius = h / 2; // full pill
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.roundRect(x, top, w, h, radius);
    ctx.fillStyle = fillCss;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeStyle = borderCss;
    ctx.stroke();
    ctx.fillStyle = inkCss;
    ctx.fillText(text, x + padX, y);
  }

  /** Elide a label to at most `maxWidth` screen px with a trailing ellipsis,
   *  measured in the ctx's CURRENT font. Returns the text unchanged when it fits;
   *  otherwise binary-searches the longest prefix that fits with the ellipsis
   *  appended. One `measureText` for the common (fits) case; ~log2(len) extra only
   *  for the long labels this exists to bound. */
  protected fitLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string {
    if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text;
    const ellipsis = "…";
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo > 0 ? text.slice(0, lo) + ellipsis : ellipsis;
  }

  protected labelVisible(node: SceneNodeData): boolean {
    // Labels appear ONLY on a real interaction — hover, selection, or pin — and render as
    // the design PILL (drawLabelPill). There are NO ambient/always-on labels: the field no
    // longer paints naked text on every feature or high-salience document (the user's
    // "nodes displaying hover information without any hover" + "overflowing black text"
    // complaint). A filtered-out node is never labelled.
    if (this.visibleNodeIds && !this.visibleNodeIds.has(node.id)) return false;
    return (
      this.hoveredId === node.id ||
      this.selectedIds.has(node.id) ||
      this.pinnedIds.has(node.id)
    );
  }
}
