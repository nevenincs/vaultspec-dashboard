import { semanticLevel } from "../../field/cameraCore";
import { nodeWorldRadius } from "../appearance";
import { uiScale } from "../uiScale";
import {
  AUTOFRAME_DEADBAND,
  AUTOFRAME_EASE,
  AUTOFRAME_POLL_MS,
  AUTOFRAME_SETTLE_EPS,
  FIT_PADDING_PX,
  MINIMAP_INSET,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./config";
import { ThreeFieldOverlay } from "./overlay";
export abstract class ThreeFieldViewport extends ThreeFieldOverlay {
  // --- camera --------------------------------------------------------------

  protected pixelsPerWorld(): number {
    return (this.height / this.viewHeight) * this.camera.zoom;
  }

  protected worldToScreen(i: number): { x: number; y: number } | null {
    const wx = this.cpuPositions[i * 4];
    const wy = this.cpuPositions[i * 4 + 1];
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const ndcX = (wx - this.camera.position.x) / halfW;
    const ndcY = (wy - this.camera.position.y) / halfH;
    return {
      x: (ndcX * 0.5 + 0.5) * this.width,
      y: (1 - (ndcY * 0.5 + 0.5)) * this.height,
    };
  }

  protected screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const ndcX = (sx / this.width) * 2 - 1;
    const ndcY = (1 - sy / this.height) * 2 - 1;
    return {
      x: this.camera.position.x + ndcX * halfW,
      y: this.camera.position.y + ndcY * halfH,
    };
  }

  protected fitToSeed(): void {
    this.frameBounds(
      -this.seedRadius,
      -this.seedRadius,
      this.seedRadius,
      this.seedRadius,
    );
  }

  /** Axis-aligned bounding box over all live node BODIES (each centre expanded by its
   *  world radius), or null when there are no finite positions yet. Expanding by the node
   *  radius — not just the centre — is what lets the fit guarantee every node's body is
   *  inside the canvas; framing bare centres half-clips a peripheral node by its radius.
   *  Shared by fitToView (cold framing) and the minimap. */
  protected graphBounds(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    if (!this.solver) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.solver.count; i++) {
      // Visibility-aware: when a filter mask is active, frame only the VISIBLE subset so a
      // filter change tightens the fit to what is shown (a hidden node never holds the frame
      // open). With no mask (visibleNodeIds null) every node counts, as before.
      if (
        this.visibleNodeIds &&
        i < this.nodes.length &&
        !this.visibleNodeIds.has(this.nodes[i].id)
      ) {
        continue;
      }
      const x = this.cpuPositions[i * 4];
      const y = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const r =
        i < this.nodes.length ? nodeWorldRadius(this.nodes[i], this.appearance) : 0;
      if (x - r < minX) minX = x - r;
      if (x + r > maxX) maxX = x + r;
      if (y - r < minY) minY = y - r;
      if (y + r > maxY) maxY = y + r;
    }
    return minX > maxX ? null : { minX, minY, maxX, maxY };
  }

  protected fitToView(): void {
    const b = this.graphBounds();
    if (!b) return this.fitToSeed();
    this.frameBounds(b.minX, b.minY, b.maxX, b.maxY);
  }

  /** One-shot frame to a SUBSET of nodes (follow-mode-selection-sync, #13): fit the camera
   *  to the bounding box of the given ids — the rail feature-select frame for that feature's
   *  members. Unknown/non-finite ids are skipped; an empty/all-unknown set is a NO-OP (the
   *  camera holds). A single node frames with a sensible margin so it doesn't slam to max
   *  zoom. Mirrors fitToView's fit math via frameBounds; the caller suspends autoframe so
   *  this deliberate user move is not immediately re-fit to the whole graph. */
  protected fitToNodes(ids: ReadonlySet<string>): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    let maxR = 0;
    for (const id of ids) {
      const i = this.idToIndex.get(id);
      if (i === undefined) continue;
      const x = this.cpuPositions[i * 4];
      const y = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const r = nodeWorldRadius(this.nodes[i], this.appearance);
      if (r > maxR) maxR = r;
      count++;
    }
    if (count === 0) return; // empty / all-unknown → no-op
    // Pad by a node radius (+ a small margin) so a single/tight cluster frames with breathing
    // room instead of zooming to the ceiling on a zero-span bbox.
    const margin = Math.max(maxR * 3, 1);
    this.frameBounds(minX - margin, minY - margin, maxX + margin, maxY + margin);
  }

  /** The camera {x, y, zoom} that fits the given bounds with the standard padding —
   *  the pure fit math, shared by the one-shot frameBounds and the eased autoframe. */
  protected fitTargetForBounds(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
  ): { x: number; y: number; zoom: number } {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);
    // Reserve a fixed, UI-scaled pixel margin on every edge: the graph fits into the
    // canvas MINUS 2×pad on each axis, so there is always a visible gap between the framed
    // node bodies and the canvas rim. Pixels-per-world is isotropic here (pixelsPerWorld()),
    // so the SAME ppw fits both axes; the tighter axis wins. zoom solves
    // ppw = (height / viewHeight) × zoom.
    const padPx = FIT_PADDING_PX * uiScale();
    const usableW = Math.max(1, this.width - 2 * padPx);
    const usableH = Math.max(1, this.height - 2 * padPx);
    const ppw = Math.min(usableW / spanX, usableH / spanY);
    const zoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, (ppw * this.viewHeight) / this.height),
    );
    return { x: cx, y: cy, zoom };
  }

  protected frameBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    const t = this.fitTargetForBounds(minX, minY, maxX, maxY);
    // A manual fit cancels any in-flight autoframe ease and records the new frame so the
    // autoframe deadband measures drift from here (no immediate re-fit fighting the user).
    // It also supersedes a pending off-slice focus (#42) — an explicit fit/frame is a newer
    // camera intent. (The warm set-data arrival path skips fitToView, so the pending focus
    // there still survives to its arrival check.)
    this.autoframeTarget = null;
    this.autoframedFrame = t;
    this.pendingFocusId = null;
    this.camera.position.set(t.x, t.y, 10);
    this.camera.zoom = t.zoom;
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  // --- autoframe (graph-autoframe) -----------------------------------------

  /** Toggle autoframe. ON starts the bounded bounds-poll interval; OFF clears it and any
   *  in-flight ease, holding the camera for full manual control. */
  protected setAutoframe(enabled: boolean): void {
    if (this.autoframe === enabled) {
      if (enabled && this.autoframeTimer === 0) this.startAutoframeTimer();
      return;
    }
    this.autoframe = enabled;
    if (enabled) {
      // Re-enabling autoframe is a fresh start — drop any selection-frame / manual-nav
      // suspension so the toggle reasserts whole-graph framing (#13 arbitration), and frame
      // immediately (reengageAutoframe polls now) rather than waiting for the next poll tick.
      this.startAutoframeTimer();
      this.reengageAutoframe();
    } else {
      this.stopAutoframeTimer();
      this.autoframeTarget = null;
    }
  }

  protected startAutoframeTimer(): void {
    this.stopAutoframeTimer();
    this.autoframeTimer = window.setInterval(
      () => this.autoframePoll(),
      AUTOFRAME_POLL_MS,
    );
  }

  protected stopAutoframeTimer(): void {
    if (this.autoframeTimer) {
      clearInterval(this.autoframeTimer);
      this.autoframeTimer = 0;
    }
  }

  /** True while the user is directly driving the camera/a node — autoframe never fights it. */
  protected isUserInteracting(): boolean {
    return (
      this.dragging || this.dragNodeIndex >= 0 || this.touchGesture || this.dragActive
    );
  }

  /** The user took manual CAMERA control (pan / zoom / wheel / pinch / minimap): DISENGAGE
   *  autoframe — drop any in-flight ease and suspend re-framing — so it never yanks the view
   *  back. Autoframe stays in its ON mode (the toggle is unchanged) but holds off until a
   *  STATE change (filter/visibility/appearance/force) or an explicit fit/toggle re-engages
   *  it (`reengageAutoframe`). A no-op when autoframe is already off. */
  protected disengageAutoframeForUserNav(): void {
    if (!this.autoframe || this.autoframeSuspended) return;
    this.autoframeSuspended = true;
    this.autoframeTarget = null;
  }

  /** A graph STATE change happened (new data, filter/visibility, appearance, force params):
   *  if autoframe is ON, RE-ENGAGE it — clear the user-nav/selection suspension and
   *  re-evaluate the fit immediately so the camera binds to the new graph without waiting for
   *  the next poll tick. The poll's deadband still guards an unchanged frame, so a state
   *  change that does not move the bounds costs nothing. A no-op when autoframe is off. */
  protected reengageAutoframe(): void {
    if (!this.autoframe) return;
    this.autoframeSuspended = false;
    // Measure the poll's drift from the CURRENT camera, not the last auto-fit: a manual nav
    // moved the camera without updating `autoframedFrame`, so without this the poll would
    // compare the bounds-fit against the stale frame, see no drift, and leave the camera at
    // the user's manual position — failing to re-frame. Nulling it makes the poll re-fit from
    // wherever the camera now is.
    this.autoframedFrame = null;
    this.autoframePoll();
  }

  /** Interval poll: when autoframe is on and the user is idle, compute the fit target and,
   *  if the frame has drifted beyond the deadband (hysteresis — so a settled/unchanged
   *  graph never re-eases and jitters), set the eased target the render loop glides toward. */
  protected autoframePoll(): void {
    if (!this.autoframe || this.autoframeSuspended || !this.renderer) return;
    if (this.isUserInteracting()) return;
    // Don't poll/reframe a HIDDEN graph (#11): when the canvas host is display:none'd (the
    // graph toggled off), its box collapses to 0×0 — skip until it is shown again. The
    // interval keeps ticking but does no work; self-detected from the DOM, so no cross-layer
    // visibility signal is needed (works for any hide mechanism fixer-3 uses).
    const el = this.renderer.domElement;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    const b = this.graphBounds();
    if (!b) return;
    const target = this.fitTargetForBounds(b.minX, b.minY, b.maxX, b.maxY);
    const ref = this.autoframedFrame ?? {
      x: this.camera.position.x,
      y: this.camera.position.y,
      zoom: this.camera.zoom,
    };
    // Fractional drift: center shift relative to the on-screen span + relative zoom change.
    const worldHalfH = this.viewHeight / 2 / Math.max(target.zoom, 1e-6);
    const centerDrift =
      Math.hypot(target.x - ref.x, target.y - ref.y) / Math.max(worldHalfH, 1);
    const zoomDrift = Math.abs(target.zoom - ref.zoom) / Math.max(ref.zoom, 1e-6);
    if (Math.max(centerDrift, zoomDrift) < AUTOFRAME_DEADBAND) return;
    this.autoframeTarget = target;
    this.wake();
  }

  /** One eased step toward the autoframe target; called from the render loop. Returns true
   *  while still easing (keeps the loop alive). Snaps + clears the target when within eps. */
  protected stepAutoframe(): boolean {
    const t = this.autoframeTarget;
    if (!t) return false;
    // Never fight a user who grabbed the camera mid-ease — drop the target.
    if (this.isUserInteracting()) {
      this.autoframeTarget = null;
      return false;
    }
    const cam = this.camera;
    const dz = t.zoom - cam.zoom;
    const dx = t.x - cam.position.x;
    const dy = t.y - cam.position.y;
    const worldHalfH = this.viewHeight / 2 / Math.max(t.zoom, 1e-6);
    const posClose =
      Math.hypot(dx, dy) / Math.max(worldHalfH, 1) < AUTOFRAME_SETTLE_EPS;
    const zoomClose = Math.abs(dz) / Math.max(t.zoom, 1e-6) < AUTOFRAME_SETTLE_EPS;
    if (posClose && zoomClose) {
      cam.position.set(t.x, t.y, 10);
      cam.zoom = t.zoom;
      this.autoframedFrame = t;
      this.autoframeTarget = null;
    } else {
      cam.position.x += dx * AUTOFRAME_EASE;
      cam.position.y += dy * AUTOFRAME_EASE;
      cam.zoom += dz * AUTOFRAME_EASE;
    }
    cam.updateProjectionMatrix();
    this.emitCameraChange();
    return this.autoframeTarget !== null;
  }

  protected zoomBy(factor: number): void {
    this.disengageAutoframeForUserNav();
    this.camera.zoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, this.camera.zoom * factor),
    );
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  /** Pan the camera by a WORLD-space delta (already divided by pixelsPerWorld), then
   *  refresh. The sign convention is the caller's: trackpad SCROLL moves the camera with
   *  the scroll delta; a DRAG (pointer / two-finger) moves it opposite the finger so the
   *  surface follows the hand. Respects nothing to clamp (panning is unbounded by design;
   *  the autoframe / fit path re-centres). */
  protected panCamera(dxWorld: number, dyWorld: number): void {
    this.disengageAutoframeForUserNav();
    this.camera.position.x += dxWorld;
    this.camera.position.y += dyWorld;
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  /** Client (page) px → canvas-local screen px, mirroring eventToScreen for a raw point
   *  (used for the touch centroid, which is computed from Touch.clientX/Y). */
  protected clientToScreen(cx: number, cy: number): [number, number] {
    const rect = this.renderer?.domElement.getBoundingClientRect();
    return [cx - (rect?.left ?? 0), cy - (rect?.top ?? 0)];
  }

  /** Centroid (client px) of the first two active touches. */
  protected touchCentroid(touches: TouchList): { x: number; y: number } {
    const a = touches[0];
    const b = touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  /** Euclidean spread (client px) between the first two active touches. */
  protected touchDistance(touches: TouchList): number {
    const a = touches[0];
    const b = touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  /** Zoom keeping the world point under (sx, sy) screen px stationary. */
  protected zoomAtScreen(factor: number, sx: number, sy: number): void {
    this.disengageAutoframeForUserNav();
    const before = this.screenToWorld(sx, sy);
    this.camera.zoom = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, this.camera.zoom * factor),
    );
    this.camera.updateProjectionMatrix();
    const after = this.screenToWorld(sx, sy);
    this.camera.position.x += before.x - after.x;
    this.camera.position.y += before.y - after.y;
    this.camera.updateProjectionMatrix();
    this.emitCameraChange();
    this.requestRender();
  }

  protected focusNode(id: string): void {
    const i = this.idToIndex.get(id);
    if (i === undefined) {
      // Off-slice target (#42): not mounted yet — remember it (bounded to one) and center
      // it when it next arrives via set-data (the ego-expand materializes it a fetch later).
      this.pendingFocusId = id;
      return;
    }
    const x = this.cpuPositions[i * 4];
    const y = this.cpuPositions[i * 4 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.camera.position.set(x, y, 10);
    this.camera.updateProjectionMatrix();
    // A successful explicit focus supersedes any older pending off-slice target.
    this.pendingFocusId = null;
    this.emitCameraChange();
    this.requestRender();
  }

  protected emitCameraChange(): void {
    const level = semanticLevel(this.camera.zoom);
    this.controller?.emit({ kind: "camera-change", scale: this.camera.zoom, level });
  }

  // --- minimap -------------------------------------------------------------

  /** Register (or clear) the chrome-hosted minimap canvas. The field owns every
   *  pixel inside it; chrome never draws. Forwarded from
   *  SceneController.setMinimapCanvas via duck-typing. */
  setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
    this.detachMinimap?.();
    this.detachMinimap = null;
    this.minimapCanvas = canvas;
    this.minimapCtx = canvas ? canvas.getContext("2d") : null;
    this.minimapView = null;
    if (canvas) {
      this.detachMinimap = this.attachMinimapInteraction(canvas);
      this.renderMinimap();
    }
  }

  /** Draw the downscaled overview (node dots) + the current-viewport rectangle into
   *  the minimap canvas. Called from renderFrame, so it tracks settle ticks, camera
   *  moves, and data changes with no separate loop (bounded). */
  protected renderMinimap(): void {
    const canvas = this.minimapCanvas;
    const ctx = this.minimapCtx;
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const b = this.graphBounds();
    if (!b) {
      this.minimapView = null;
      return;
    }
    const spanX = Math.max(b.maxX - b.minX, 1);
    const spanY = Math.max(b.maxY - b.minY, 1);
    const scale = Math.min(
      (w * (1 - 2 * MINIMAP_INSET)) / spanX,
      (h * (1 - 2 * MINIMAP_INSET)) / spanY,
    );
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    this.minimapView = { scale, cx, cy };
    const toX = (wx: number): number => w / 2 + (wx - cx) * scale;
    const toY = (wy: number): number => h / 2 - (wy - cy) * scale; // world up = screen up

    // Node dots — a faint muted-ink constellation; bounded dot size.
    const count = this.solver?.count ?? 0;
    const dot = Math.max(1, Math.min(2.5, scale * 6));
    const r = dot / 2;
    ctx.fillStyle = this.overlayTheme().inkMuted; // SGR-006: cached per theme epoch
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < count; i++) {
      // Match the visibility-aware bounds: a filtered-out node is not drawn on the overview.
      if (
        this.visibleNodeIds &&
        i < this.nodes.length &&
        !this.visibleNodeIds.has(this.nodes[i].id)
      ) {
        continue;
      }
      const x = this.cpuPositions[i * 4];
      const y = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      ctx.fillRect(toX(x) - r, toY(y) - r, dot, dot);
    }
    ctx.globalAlpha = 1;

    // Viewport rectangle — the current camera view in world → minimap. The only
    // stroked outline on the overview, so position reads in grayscale too.
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const left = toX(this.camera.position.x - halfW);
    const right = toX(this.camera.position.x + halfW);
    const top = toY(this.camera.position.y + halfH);
    const bottom = toY(this.camera.position.y - halfH);
    ctx.strokeStyle = this.overlayTheme().accent; // SGR-006: cached per theme epoch
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(left) + 0.5,
      Math.round(top) + 0.5,
      Math.max(1, Math.round(right - left)),
      Math.max(1, Math.round(bottom - top)),
    );
  }

  /** Pointer click/drag on the minimap pans the main camera to the picked world
   *  point. Returns a cleanup that removes the listeners. */
  protected attachMinimapInteraction(canvas: HTMLCanvasElement): () => void {
    const toWorld = (ev: PointerEvent): { x: number; y: number } | null => {
      const view = this.minimapView;
      if (!view) return null;
      const rect = canvas.getBoundingClientRect();
      // CSS px → backing-store px (canvas.width may differ from its CSS size).
      const sx = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
      const sy = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
      return {
        x: view.cx + (sx - canvas.width / 2) / view.scale,
        y: view.cy - (sy - canvas.height / 2) / view.scale,
      };
    };
    const panTo = (ev: PointerEvent): void => {
      const world = toWorld(ev);
      if (!world) return;
      // Minimap pan is manual navigation → disengage autoframe (idempotent).
      this.disengageAutoframeForUserNav();
      this.camera.position.set(world.x, world.y, 10);
      this.camera.updateProjectionMatrix();
      this.emitCameraChange();
      this.requestRender();
    };
    const onDown = (ev: PointerEvent): void => {
      this.minimapDragging = true;
      canvas.setPointerCapture(ev.pointerId);
      panTo(ev);
    };
    const onMove = (ev: PointerEvent): void => {
      if (this.minimapDragging) panTo(ev);
    };
    const onUp = (ev: PointerEvent): void => {
      this.minimapDragging = false;
      if (canvas.hasPointerCapture(ev.pointerId))
        canvas.releasePointerCapture(ev.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.style.cursor = "pointer";
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }
}
