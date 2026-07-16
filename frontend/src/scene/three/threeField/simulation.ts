import { Color } from "three";
import {
  edgeAppearance,
  edgeEndColors,
  nodeWorldRadius,
  type AppearanceParams,
} from "../appearance";
import { type D3ForceParams } from "../d3ForceSolver";
import { uiScale } from "../uiScale";
import {
  DISPLAY_LERP_K,
  DISPLAY_SNAP_EPS,
  EMPHASIS_FADE_TAU_MS,
  GENTLE_REHEAT_ALPHA,
  NODE_RECEDE_HOVER,
  NODE_RECEDE_SELECT,
  PERF_DEGRADE_MS,
  PERF_RESTORE_MS,
  SIM_MAX_CATCHUP_TICKS,
  SIM_TICK_MS,
} from "./config";
import { forceChangeFraction, prefersReducedMotion } from "./geometry";
import { ThreeFieldData } from "./data";
export abstract class ThreeFieldSimulation extends ThreeFieldData {
  // --- emphasis / visibility -----------------------------------------------

  /** Active emphasis set (hover takes precedence; else shared selection). */
  protected emphasisSet(): Set<string> | null {
    if (this.hoveredId) {
      const set = new Set<string>([this.hoveredId]);
      for (const nb of this.neighbors.get(this.hoveredId) ?? []) set.add(nb);
      const node = this.nodes[this.idToIndex.get(this.hoveredId) ?? -1];
      for (const tag of node?.featureTags ?? []) {
        for (const id of this.featureCohort.get(tag) ?? []) set.add(id);
      }
      return set;
    }
    // DURABLE feature-cluster spotlight (feature-selection-global-state): a selected
    // feature emphasises its member cohort — derived LIVE from `featureCohort` (rebuilt
    // every setData) plus the feature node itself when rendered — so the spotlight is
    // re-derived (never lost) across a data reload. Sits ABOVE the generic selected-ids
    // branch so a `feature:<tag>` id can never fall through and dim the whole graph. An
    // all-absent cohort yields no emphasis (returns null) rather than dimming everything.
    if (this.spotlightFeatureTag) {
      const set = new Set<string>();
      for (const id of this.featureCohort.get(this.spotlightFeatureTag) ?? []) {
        if (this.idToIndex.has(id)) set.add(id);
      }
      const featureNodeId = `feature:${this.spotlightFeatureTag}`;
      if (this.idToIndex.has(featureNodeId)) set.add(featureNodeId);
      return set.size > 0 ? set : null;
    }
    if (this.selectedIds.size > 0) {
      const set = new Set<string>(this.selectedIds);
      for (const id of this.selectedIds) {
        for (const nb of this.neighbors.get(id) ?? []) set.add(nb);
      }
      return set;
    }
    return null;
  }

  protected applyEmphasis(): void {
    if (!this.nodeMesh) return;
    const active = this.emphasisSet();
    // NODES — continuous colour-recede (emphasis-state-grammar ADR): each node's TARGET
    // recede fraction is 0 for a focus node (or no emphasis) and otherwise the depth of
    // the ACTIVE state — shallow for a transient hover, deeper for a durable selection /
    // feature spotlight, so the durable state reads stronger. The frame loop eases the
    // displayed aDim toward these targets (cross-fade, never a pop); reduced motion snaps.
    // De-emphasis stays colour-only at FULL alpha; a focus node keeps full saturation.
    const depth = this.hoveredId ? NODE_RECEDE_HOVER : NODE_RECEDE_SELECT;
    if (this.dimTarget.length !== this.nodes.length) {
      this.dimTarget = new Float32Array(this.nodes.length);
    }
    for (let i = 0; i < this.nodes.length; i++) {
      this.dimTarget[i] = active && !active.has(this.nodes[i].id) ? depth : 0;
    }
    // Fence presence target: rises while a feature spotlight is set; on clear the tag is
    // RETAINED (fenceTag) so the fade-out still knows its cohort, released at alpha 0.
    if (this.spotlightFeatureTag) this.fenceTag = this.spotlightFeatureTag;
    this.fenceTargetAlpha = this.spotlightFeatureTag ? 1 : 0;
    if (prefersReducedMotion()) {
      const nodeDim = this.nodeMesh.geometry.getAttribute("aDim");
      const glyphDim = this.glyphMesh?.geometry.getAttribute("aDim");
      for (let i = 0; i < this.nodes.length; i++) {
        nodeDim.setX(i, this.dimTarget[i]);
        glyphDim?.setX(i, this.dimTarget[i]); // the icon recedes with its circle
      }
      nodeDim.needsUpdate = true;
      if (glyphDim) glyphDim.needsUpdate = true;
      this.fenceAlpha = this.fenceTargetAlpha;
      if (this.fenceAlpha === 0) this.fenceTag = null;
      this.emphasisAnim = false;
      return;
    }
    if (!this.emphasisAnim) this.lastEmphasisTs = performance.now();
    this.emphasisAnim = true;
    this.requestRender();

    // EDGES keep their category GRADIENT colour + confidence width in EVERY mode (built once
    // in buildEdges, never recoloured on hover/selection) — user goal: theme palette only,
    // gradients kept, no near-black recolour. Emphasis touches nodes only (above); edge alpha
    // depends solely on confidence + the filter visibility mask (applyEdgeAlpha).
  }

  protected applyVisibility(
    nodeIds: ReadonlySet<string>,
    edgeIds: ReadonlySet<string>,
  ): void {
    if (!this.nodeMesh || !this.edgeMesh) return;
    const hidden = this.nodeMesh.geometry.getAttribute("aHidden");
    const glyphHidden = this.glyphMesh?.geometry.getAttribute("aHidden");
    for (let i = 0; i < this.nodes.length; i++) {
      const h = nodeIds.has(this.nodes[i].id) ? 0 : 1;
      hidden.setX(i, h);
      glyphHidden?.setX(i, h); // a filtered-out node hides its icon too
    }
    hidden.needsUpdate = true;
    if (glyphHidden) glyphHidden.needsUpdate = true;
    // edgeIds membership is by edge id; we kept only endpoint ids, so visibility
    // falls back to endpoint membership (both endpoints visible ⇒ shown). Apply the
    // edge alpha from the retained base opacity gated by that mask.
    void edgeIds;
    this.applyEdgeAlpha();
  }

  /** Write every edge quad's displayed alpha from its retained base opacity gated by
   *  the current visibility mask, so an opacity retune and a filter compose (and a
   *  retune never clobbers a hidden edge). */
  protected applyEdgeAlpha(): void {
    if (!this.edgeMesh) return;
    const alpha = this.edgeMesh.geometry.getAttribute("aAlpha");
    const vis = this.visibleNodeIds;
    // Edges show their confidence-derived base opacity in every mode (gated by the filter
    // visibility mask) — no hover alpha boost, so the hover↔non-hover difference stays subtle.
    this.builtEdges.forEach((e, i) => {
      const shown = !vis || (vis.has(e.srcId) && vis.has(e.dstId));
      const a = shown ? (this.edgeBaseAlpha[i] ?? 0) : 0;
      for (let k = 0; k < 4; k++) alpha.setX(i * 4 + k, a);
    });
    alpha.needsUpdate = true;
  }

  // --- render loop ---------------------------------------------------------

  /** Cold restart — a full re-explode of the current data (explicit reheat). */
  protected reheat(): void {
    if (this.frozen || !this.solver) return;
    this.solver.reheat(true);
    this.setRunning(true);
    this.wake();
  }

  /** Resume ticking after a pause — ENERGY-NEUTRAL (GIR-002). Resumes an in-flight
   *  settle WITHOUT pumping new heat; a graph already at rest stays exactly put. An
   *  explicit re-energise is reheatNow()'s job, never resume()'s. Mirrors the set-frozen
   *  unfreeze path so pause/resume and freeze/unfreeze behave identically.
   *
   *  This is the accepted stability design, not a limitation (ADR "graph simulation
   *  stability model", Option B): a settled layout is a frozen-yet-authoritative state
   *  held still by pinning, so resuming must NOT re-inject energy — doing so would
   *  displace an at-rest layout for no user action. Every energy-injecting path is a
   *  deliberate, named entry point (set-data warm-start, setForceParams retune,
   *  reheatNow restart); resume is not one of them. The reserved Option-A anneal (make
   *  rest a true force-field fixed point) is revisited only under the recorded re-open
   *  trigger: at-rest displacement or contact micro-buzz recurring after these valves
   *  close. */
  protected resume(): void {
    if (this.frozen || !this.solver) return;
    if (!this.solver.isSettled()) {
      this.setRunning(true);
      this.wake();
    }
  }

  reheatNow(): void {
    this.reheat();
  }

  /** Flag the position texture for re-upload after pack() writes cpuPositions. */
  protected uploadPositions(): void {
    if (this.positionTex) this.positionTex.needsUpdate = true;
  }

  /** Re-tune the force parameters live (graph-lab knob set) and reheat GENTLY +
   *  PROPORTIONALLY: the kick is scaled to how far the changed knobs actually moved
   *  (normalised by each control's schema range), so a small nudge re-settles softly in
   *  place and only a large retune warms more — never the old violent global 0.5
   *  re-explode. A no-op set (identical params) skips the reheat entirely. */
  setForceParams(params: Partial<D3ForceParams>): void {
    const frac = forceChangeFraction(this.params, params);
    this.params = { ...this.params, ...params };
    if (this.solver && frac > 0) {
      // A floor (0.3×) keeps even a tiny nudge perceptibly responsive; the full gentle
      // alpha is reserved for a full-range change.
      this.solver.setParams(this.params, GENTLE_REHEAT_ALPHA * Math.max(0.3, frac));
      this.setRunning(true);
      this.wake();
      // A force-param (simulation) change reshapes the layout: when autoframe is on, bind to
      // it (re-engage even if a prior manual nav had disengaged). The running loop's poll then
      // tracks the bounds as the layout re-settles.
      this.reengageAutoframe();
    }
  }

  /**
   * Re-tune the LOOK live (node module size, edge width/opacity) — the appearance
   * sibling of setForceParams. Edge changes just rewrite the instanced width/alpha
   * attributes with NO re-simulation (cheap). A node-SIZE change also re-feeds the
   * solver's collide radii so non-overlap spacing tracks the drawn size, which does
   * gently reheat — node size is both look and collision body, so it cannot be a
   * pure attribute rewrite. A change that touches neither (no-op) costs nothing.
   */
  setAppearanceParams(params: Partial<AppearanceParams>): void {
    const prev = this.appearance;
    this.appearance = { ...prev, ...params };

    const sizeChanged =
      this.appearance.nodeSizeScale !== prev.nodeSizeScale ||
      this.appearance.nodeSalienceScale !== prev.nodeSalienceScale;
    const edgeChanged =
      this.appearance.edgeWidthMin !== prev.edgeWidthMin ||
      this.appearance.edgeWidthMax !== prev.edgeWidthMax ||
      this.appearance.edgeOpacityMin !== prev.edgeOpacityMin ||
      this.appearance.edgeOpacityMax !== prev.edgeOpacityMax ||
      this.appearance.edgeColorMode !== prev.edgeColorMode;
    const iconsChanged = this.appearance.nodeIcons !== prev.nodeIcons;
    // A node COLOUR MODE change (category ↔ recency heat, code-graph-heat ADR)
    // re-bakes every baked colour consumer at once — node aColor, edge
    // end-colours, glyph inks, minimap — via the proven refresh-theme rebuild
    // (layout + selection preserved). One rebuild on a rare, deliberate toggle
    // beats a bespoke partial-rewrite path that could drift from build truth.
    // The rebuild re-derives sizes/edge widths from the merged appearance too,
    // so it SUBSUMES the attribute rewrites below (they skip when it ran);
    // solver collide radii and the icon visibility toggle still apply after.
    const colorModeChanged = this.appearance.nodeColorMode !== prev.nodeColorMode;
    if (colorModeChanged) this.rebuildGLResources();

    if (sizeChanged && this.nodeMesh) {
      if (!colorModeChanged) {
        const aSize = this.nodeMesh.geometry.getAttribute("aSize");
        const glyphSize = this.glyphMesh?.geometry.getAttribute("aSize");
        for (let i = 0; i < this.nodes.length; i++) {
          const r = nodeWorldRadius(this.nodes[i], this.appearance);
          aSize.setX(i, r);
          glyphSize?.setX(i, r); // the icon tracks the dot's size
        }
        aSize.needsUpdate = true;
        if (glyphSize) glyphSize.needsUpdate = true;
      }
      // Node size is the collision body too: re-feed collide radii so spacing tracks
      // the drawn size (the solver rebuilds collide + gently reheats).
      if (this.solver) {
        this.solver.setRadii(
          this.nodes.map((node) => nodeWorldRadius(node, this.appearance)),
        );
        this.setRunning(true);
        this.wake();
      }
    }

    if (edgeChanged && !colorModeChanged && this.edgeMesh && this.edgeData.length > 0) {
      const aWidth = this.edgeMesh.geometry.getAttribute("aWidthPx");
      const aColor = this.edgeMesh.geometry.getAttribute("aColor");
      const colA = new Color();
      const colB = new Color();
      this.edgeData.forEach((e, i) => {
        const ap = edgeAppearance(e, this.appearance);
        this.edgeBaseAlpha[i] = ap.alpha;
        const s = this.idToIndex.get(e.src) ?? 0;
        const t = this.idToIndex.get(e.dst) ?? 0;
        const endColors = edgeEndColors(
          this.appearance.edgeColorMode,
          this.nodeColors[s],
          this.nodeColors[t],
        );
        colA.set(endColors.a);
        colB.set(endColors.b);
        for (let k = 0; k < 4; k++) {
          aWidth.setX(i * 4 + k, ap.width);
          const c = k < 2 ? colA : colB;
          aColor.setXYZ(i * 4 + k, c.r, c.g, c.b);
        }
      });
      aWidth.needsUpdate = true;
      aColor.needsUpdate = true;
      this.applyEdgeAlpha();
    }

    if (iconsChanged) {
      const on = this.appearance.nodeIcons;
      // The disc is always drawn (no uIconMode fade now); icon mode only toggles whether the
      // inside-disc glyph layer is present/visible.
      // Build the icon layer on first enable; thereafter just toggle its visibility.
      if (on && !this.glyphMesh && this.solver && this.nodeMesh) {
        const aColor = this.nodeMesh.geometry.getAttribute("aColor")
          .array as Float32Array;
        const aSize = this.nodeMesh.geometry.getAttribute("aSize")
          .array as Float32Array;
        this.buildGlyphs(this.nodes, this.solver.texSize, aColor, aSize);
        // Reflect the current emphasis/visibility onto the freshly-built glyph attrs.
        this.applyEmphasis();
        if (this.visibleNodeIds) {
          this.applyVisibility(this.visibleNodeIds, new Set<string>());
        }
      }
      if (this.glyphMesh) this.glyphMesh.visible = on;
    }

    // A node-SIZE (display) change alters each node's body radius, so the framed bounds
    // change (graphBounds expands by radius): when autoframe is on, bind to it and re-frame.
    // Edge/icon-only changes do not move bounds, so they do not re-engage.
    if (sizeChanged) this.reengageAutoframe();

    this.requestRender();
  }

  /**
   * Tick-level dynamics snapshot (bypasses the rAF loop): single-steps `ticks`
   * iterations and returns per-tick alpha (the cooling schedule) and mean per-node
   * displacement (→0 at rest — the jitter/instability signature). Updates the view
   * and leaves the loop stopped.
   */
  diagnose(ticks: number): { alpha: number[]; meanDisplacement: number[] } {
    const out = { alpha: [] as number[], meanDisplacement: [] as number[] };
    if (!this.solver) return out;
    this.setRunning(false);
    for (let t = 0; t < ticks; t++) {
      const m = this.solver.tick();
      out.alpha.push(+m.alpha.toFixed(5));
      out.meanDisplacement.push(+m.meanDisplacement.toFixed(4));
    }
    this.solver.pack(this.simPositions);
    this.cpuPositions.set(this.simPositions);
    this.displayEasing = false;
    this.uploadPositions();
    this.requestRender();
    return out;
  }

  protected requestRender(): void {
    this.needsRender = true;
    this.wake();
  }

  /** The ONE `running` mutation point: emits `sim-state` on every TRANSITION (never
   *  per frame) so the chrome's play/pause control mirrors the sim's own truth —
   *  including the auto-flip back to "play" when the cooling schedule settles. */
  protected setRunning(next: boolean): void {
    if (this.running === next) return;
    this.running = next;
    // Fresh run → fresh accumulator epoch, so idle time never counts as catch-up.
    if (next) this.lastSimTs = 0;
    this.controller?.emit({ kind: "sim-state", running: next });
  }

  protected wake(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  protected frame = (): void => {
    this.scheduled = false;
    let dirty = this.needsRender;
    this.needsRender = false;

    if (this.solver && this.running) {
      // d3-force ticks on the CPU, then mirror positions into the GPU texture.
      // Freeze when the solver has cooled below alphaMin (and no drag holds it
      // warm) — a real convergence stop that idles the GPU to zero. The settle
      // TRANSITION persists the layout as the next cold load's base
      // (graph-simulation-stability ADR) — once per settle, never per frame.
      //
      // Fixed-timestep accumulator (sim-smoothness reference): the sim targets a
      // 60Hz tick rate in WALL-CLOCK terms. A slow renderer (long frames) runs
      // bounded catch-up ticks so the anneal/stall budgets and the felt settle
      // duration stop depending on the frame rate; the catch-up cap keeps a
      // pathological stall from spiraling the CPU.
      const now = performance.now();
      const elapsed = this.lastSimTs > 0 ? now - this.lastSimTs : SIM_TICK_MS;
      this.lastSimTs = now;
      const ticks = Math.max(
        1,
        Math.min(SIM_MAX_CATCHUP_TICKS, Math.round(elapsed / SIM_TICK_MS)),
      );
      for (let t = 0; t < ticks; t++) {
        this.solver.tick();
        if (!this.dragActive && this.solver.isSettled()) break;
      }
      this.solver.pack(this.simPositions);
      this.applyDisplayLerp();
      this.uploadPositions();
      if (!this.dragActive && this.solver.isSettled()) {
        this.setRunning(false);
        this.persistSettledLayout();
      }
      dirty = true;
    } else if (this.displayEasing) {
      // Physics is at rest (settled or paused) but the DISPLAY is still gliding
      // toward it (render-time lerp): finish the glide, then snap to exact physics
      // truth — the frozen layout stays authoritative on screen too.
      this.applyDisplayLerp();
      this.uploadPositions();
      dirty = true;
    }

    // Autoframe ease (graph-autoframe): glide the camera one step toward the polled fit
    // target. Keeps the loop alive while easing so it animates smoothly even at GPU idle.
    let easing = false;
    if (this.autoframeTarget) {
      easing = this.stepAutoframe();
      dirty = true;
    }

    // Emphasis cross-fade (emphasis-state-grammar ADR): ease every node's displayed
    // recede + the fence alpha toward their targets, holding the loop awake until settled.
    if (this.emphasisAnim) {
      this.stepEmphasisFade();
      dirty = true;
    }

    // SGR-005: any dirty frame may have moved node positions (tick+pack), the
    // camera (autoframe ease), the data, or the viewport (resize sets needsRender)
    // — all pick inputs — so the pointer-delta pick cache is no longer valid.
    if (dirty) this.pickCacheValid = false;

    // Skip the GPU render while the canvas host is HIDDEN (graph toggled off → host
    // display:none → 0×0, #11): the CPU sim above still advances so the layout settles
    // off-screen, but zero GPU work is done. On re-show the ResizeObserver fires
    // resize→requestRender and the next frame paints the current state (no blank). This
    // makes "hidden == 0 GPU" hold even mid-settle, beyond the settled render-on-demand
    // idle. Mirrors the autoframe hidden-pause guard.
    const el = this.renderer?.domElement;
    const hidden = !el || el.clientWidth === 0 || el.clientHeight === 0;
    if (dirty && !hidden) {
      const t0 = performance.now();
      this.renderFrame();
      this.updatePerfLod(performance.now() - t0);
    }
    if (
      this.running ||
      this.needsRender ||
      easing ||
      this.emphasisAnim ||
      this.displayEasing
    ) {
      this.wake();
    }
  };

  /** Render-time position lerp (sim-smoothness reference — the Quartz mechanism):
   *  ease the DISPLAY buffer (`cpuPositions`, feeding the GPU texture, overlays, and
   *  picking) toward the physics truth (`simPositions`) each frame, time-averaging
   *  solver jitter ~8x before it reaches the screen. The dragged node snaps (no
   *  rubber-band under the cursor); prefers-reduced-motion snaps everything; once
   *  every coordinate is within epsilon the display snaps to EXACT physics truth so
   *  the frozen layout stays authoritative on screen. */
  protected applyDisplayLerp(): void {
    const sim = this.simPositions;
    const disp = this.cpuPositions;
    if (sim.length === 0 || disp.length !== sim.length) return;
    if (prefersReducedMotion()) {
      disp.set(sim);
      this.displayEasing = false;
      return;
    }
    let maxErr = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const b = i * 4;
      if (i === this.dragNodeIndex) {
        disp[b] = sim[b];
        disp[b + 1] = sim[b + 1];
        continue;
      }
      for (let c = 0; c < 2; c++) {
        const target = sim[b + c];
        if (!Number.isFinite(target)) continue;
        const cur = disp[b + c];
        if (!Number.isFinite(cur)) {
          disp[b + c] = target;
          continue;
        }
        const next = cur + (target - cur) * DISPLAY_LERP_K;
        const err = Math.abs(target - next);
        if (err > maxErr) maxErr = err;
        disp[b + c] = err < DISPLAY_SNAP_EPS ? target : next;
      }
    }
    this.displayEasing = maxErr >= DISPLAY_SNAP_EPS;
  }

  /** One exponential-ease step of the emphasis cross-fade: move every node's displayed
   *  aDim (and the fence alpha) toward its target; snap + stop once everything is within
   *  epsilon. dt is clamped so a background-tab stall can't teleport past the ease. */
  protected stepEmphasisFade(): void {
    const nodeDim = this.nodeMesh?.geometry.getAttribute("aDim");
    if (!nodeDim) {
      this.emphasisAnim = false;
      return;
    }
    const glyphDim = this.glyphMesh?.geometry.getAttribute("aDim");
    const now = performance.now();
    const dt = Math.min(100, Math.max(0, now - this.lastEmphasisTs));
    this.lastEmphasisTs = now;
    const k = 1 - Math.exp(-dt / EMPHASIS_FADE_TAU_MS);
    const EPS = 0.004;
    let maxErr = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const target = this.dimTarget[i] ?? 0;
      const cur = nodeDim.getX(i);
      let next = cur + (target - cur) * k;
      const err = Math.abs(target - next);
      if (err < EPS) next = target;
      else if (err > maxErr) maxErr = err;
      nodeDim.setX(i, next);
      glyphDim?.setX(i, next); // the icon recedes with its circle
    }
    let fenceNext = this.fenceAlpha + (this.fenceTargetAlpha - this.fenceAlpha) * k;
    const fenceErr = Math.abs(this.fenceTargetAlpha - fenceNext);
    if (fenceErr < EPS) fenceNext = this.fenceTargetAlpha;
    else if (fenceErr > maxErr) maxErr = fenceErr;
    this.fenceAlpha = fenceNext;
    nodeDim.needsUpdate = true;
    if (glyphDim) glyphDim.needsUpdate = true;
    if (maxErr < EPS) {
      this.emphasisAnim = false;
      // The fade-out has fully landed: release the lagging fence cohort tag.
      if (this.fenceTargetAlpha === 0) this.fenceTag = null;
    }
  }

  /**
   * FPS-adaptive LOD (perf hardening #5). Tracks an EMA of render cost and, with hysteresis
   * so it can't flap, degrades quality when frames get slow — covering the two-tier software
   * fallback (a fill-bound software-WebGL context on a large graph). Two clean levers: halve
   * the device-pixel-ratio (~4x fewer fragments — the biggest lever for fill-bound rendering,
   * no flicker, no filter conflict) and quarter the label budget (the per-frame 2D-overlay
   * cost, see drawLabels). Heavier tiers (salience-ordered node-draw cap, instancing
   * reduction) are a follow-on if these prove insufficient.
   */
  protected updatePerfLod(frameMs: number): void {
    this.frameMsEma =
      this.frameMsEma === 0 ? frameMs : this.frameMsEma * 0.8 + frameMs * 0.2;
    const wasDegraded = this.perfDegraded;
    if (!this.perfDegraded && this.frameMsEma > PERF_DEGRADE_MS)
      this.perfDegraded = true;
    else if (this.perfDegraded && this.frameMsEma < PERF_RESTORE_MS)
      this.perfDegraded = false;
    if (this.perfDegraded !== wasDegraded && this.renderer) {
      this.renderer.setPixelRatio(this.perfDegraded ? Math.min(1, this.dpr) : this.dpr);
      this.needsRender = true;
    }
  }

  protected renderFrame(): void {
    if (!this.renderer) return;
    const tex = this.positionTex;
    const ppw = this.pixelsPerWorld();
    const pxScale = uiScale();
    if (this.nodeMaterial) {
      this.nodeMaterial.uniforms.uPositions.value = tex;
      this.nodeMaterial.uniforms.uPixelsPerWorld.value = ppw;
      this.nodeMaterial.uniforms.uPxScale.value = pxScale;
    }
    if (this.edgeMaterial) {
      this.edgeMaterial.uniforms.uPositions.value = tex;
      this.edgeMaterial.uniforms.uPixelsPerWorld.value = ppw;
      this.edgeMaterial.uniforms.uPxScale.value = pxScale;
    }
    if (this.glyphMaterial && this.glyphMesh?.visible) {
      this.glyphMaterial.uniforms.uPositions.value = tex;
      this.glyphMaterial.uniforms.uPixelsPerWorld.value = ppw;
      this.glyphMaterial.uniforms.uPxScale.value = pxScale;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawLabels();
    this.emitAnchors();
    this.renderMinimap();
  }
}
