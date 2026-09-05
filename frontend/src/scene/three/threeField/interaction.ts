import { nodeWorldRadius } from "../appearance";
import { uiScale } from "../uiScale";
import {
  NODE_DRAG_THRESHOLD_PX,
  PICK_RADIUS_PX,
  PINCH_ZOOM_SENSITIVITY,
  ZOOM_STEP_WHEEL,
} from "./config";
import { ThreeFieldViewport } from "./viewport";
export class ThreeFieldInteraction extends ThreeFieldViewport {
  // --- picking + interaction ----------------------------------------------

  protected setHovered(id: string | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    this.applyEmphasis();
    this.controller?.emit({ kind: "hover", id });
    this.requestRender();
  }

  protected pickNodeAtScreen(sx: number, sy: number): string | null {
    // cpuPositions is the live source of truth (pack() runs every tick), so the
    // hit test is always current — no GPU readback.
    //
    // SGR-005 pointer-delta gate: pointermove fires at device rate, so a hover
    // hold re-scans O(N) for a sub-pixel jiggle. When the pick cache is still
    // valid (no dirty frame / setData since the last pick) and the pointer moved
    // <1px, reuse the last result — provably correct because nothing that affects
    // a pick (positions, camera, data, viewport) has changed in that window.
    if (
      this.pickCacheValid &&
      (sx - this.lastPickSx) ** 2 + (sy - this.lastPickSy) ** 2 < 1
    ) {
      return this.lastPickId;
    }

    const ppw = this.pixelsPerWorld();
    // SGR-004/005: hoist the per-node loop invariants OUT of the scan. `uiScale()`
    // is a forced computed-style read (now cached, but still hoisted to one call),
    // and the camera half-extents + viewport feed the INLINED `worldToScreen`
    // projection (same math as the method) so the loop carries no invariant work.
    const pickRadiusScreen = PICK_RADIUS_PX * uiScale();
    const halfW = (this.camera.right - this.camera.left) / 2 / this.camera.zoom;
    const halfH = (this.camera.top - this.camera.bottom) / 2 / this.camera.zoom;
    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const width = this.width;
    const height = this.height;

    let best: string | null = null;
    let bestDistSq = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.visibleNodeIds && !this.visibleNodeIds.has(this.nodes[i].id)) continue;
      const wx = this.cpuPositions[i * 4];
      const wy = this.cpuPositions[i * 4 + 1];
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      const px = ((wx - camX) / halfW / 2 + 0.5) * width;
      const py = (1 - ((wy - camY) / halfH / 2 + 0.5)) * height;
      const radius = Math.max(
        pickRadiusScreen,
        nodeWorldRadius(this.nodes[i], this.appearance) * ppw,
      );
      const dx = px - sx;
      const dy = py - sy;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radius * radius && distSq < bestDistSq) {
        bestDistSq = distSq;
        best = this.nodes[i].id;
      }
    }

    this.lastPickSx = sx;
    this.lastPickSy = sy;
    this.lastPickId = best;
    this.pickCacheValid = true;
    return best;
  }

  protected eventToScreen(ev: MouseEvent): [number, number] {
    const rect = this.renderer?.domElement.getBoundingClientRect();
    return [ev.clientX - (rect?.left ?? 0), ev.clientY - (rect?.top ?? 0)];
  }

  protected startNodeDrag(index: number, sx: number, sy: number): void {
    if (this.frozen || !this.solver) return;
    this.pendingDragIndex = -1;
    this.dragNodeIndex = index;
    this.dragActive = true;
    // No global re-energise: the solver pins the grabbed node and wakes only its
    // link-neighbours within wakeRadius (the sleep/active-set model); every other
    // settled node stays pinned, so distant clusters do not move.
    this.setRunning(true);
    const w = this.screenToWorld(sx, sy);
    this.solver.setDrag(index, w.x + this.dragOffset.x, w.y + this.dragOffset.y);
    this.wake();
  }

  protected endNodeDrag(): void {
    if (!this.releaseNodeDrag()) return;
    // Keep ticking; the released neighbourhood re-settles via the solver, then sleeps.
    this.setRunning(true);
    this.wake();
  }

  private releaseNodeDrag(): boolean {
    this.pendingDragIndex = -1;
    this.dragOffset = { x: 0, y: 0 };
    if (this.dragNodeIndex < 0) return false;
    this.solver?.clearDrag();
    const position = this.solver?.position(this.dragNodeIndex);
    if (position) {
      const b = this.dragNodeIndex * 4;
      this.simPositions[b] = this.cpuPositions[b] = position.x;
      this.simPositions[b + 1] = this.cpuPositions[b + 1] = position.y;
      this.pickCacheValid = false;
      this.needsRender = true;
      this.uploadPositions();
    }
    this.dragNodeIndex = -1;
    this.dragActive = false;
    return true;
  }

  /** Cancel without starting a settle: disposal and freeze own the running state. */
  protected cancelInteraction(): void {
    this.releaseNodeDrag();
    this.dragging = false;
    this.dragMoved = false;
    this.touchGesture = false;
    this.lastTouchCentroid = null;
    this.lastTouchDist = 0;
    const gesture = this.pointerGesture;
    this.pointerGesture = null;
    if (gesture?.element.hasPointerCapture(gesture.id)) {
      gesture.element.releasePointerCapture(gesture.id);
    }
    this.setCursor("default");
  }

  protected setCursor(c: string): void {
    if (this.renderer) this.renderer.domElement.style.cursor = c;
  }

  protected attachInteraction(el: HTMLElement): void {
    el.addEventListener(
      "wheel",
      (ev: WheelEvent) => {
        // Trackpad QoL (graph-trackpad-nav): the browser delivers a trackpad PINCH as a
        // wheel event with `ctrlKey` set, and a two-finger SCROLL as a wheel event with
        // deltaX/deltaY and no modifier. So:
        //   • ctrl/⌘+wheel (pinch, or a deliberate zoom modifier) → ZOOM toward the cursor;
        //   • a classic MOUSE WHEEL (axis-locked vertical notch — no deltaX, line-mode or a
        //     coarse |deltaY|) → ZOOM, so mouse users are NOT regressed;
        //   • everything else (fine, often-horizontal two-finger trackpad scroll) → PAN.
        // preventDefault stops the page/panel from scrolling under the canvas.
        ev.preventDefault();
        const [sx, sy] = this.eventToScreen(ev);
        const pinch = ev.ctrlKey || ev.metaKey;
        const mouseWheel =
          !pinch &&
          ev.deltaX === 0 &&
          (ev.deltaMode !== 0 || Math.abs(ev.deltaY) >= 100);
        if (pinch) {
          this.zoomAtScreen(Math.exp(-ev.deltaY * PINCH_ZOOM_SENSITIVITY), sx, sy);
        } else if (mouseWheel) {
          this.zoomAtScreen(
            ev.deltaY < 0 ? ZOOM_STEP_WHEEL : 1 / ZOOM_STEP_WHEEL,
            sx,
            sy,
          );
        } else {
          // Two-finger scroll → pan (scroll sense: the camera follows the scroll delta).
          const ppw = this.pixelsPerWorld();
          this.panCamera(ev.deltaX / ppw, -ev.deltaY / ppw);
        }
      },
      { passive: false },
    );
    el.addEventListener("pointerdown", (ev: PointerEvent) => {
      // A two-finger touch gesture owns pan/zoom; ignore the per-finger pointer stream.
      if (this.touchGesture || this.pointerGesture) return;
      this.dragMoved = false;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      this.pointerGesture = {
        id: ev.pointerId,
        element: el,
        startX: ev.clientX,
        startY: ev.clientY,
      };
      el.setPointerCapture(ev.pointerId);
      const [sx, sy] = this.eventToScreen(ev);
      const id = ev.button === 0 ? this.pickNodeAtScreen(sx, sy) : null;
      const i = id ? this.idToIndex.get(id) : undefined;
      if (i !== undefined) {
        // A press remains energy-neutral until it travels beyond click tolerance.
        // Keep the grabbed point relative to the drawn node, avoiding a center snap.
        if (!this.frozen) {
          const w = this.screenToWorld(sx, sy);
          this.pendingDragIndex = i;
          this.dragOffset = {
            x: this.cpuPositions[i * 4] - w.x,
            y: this.cpuPositions[i * 4 + 1] - w.y,
          };
          this.setCursor("grab");
        }
      } else {
        this.dragging = true; // camera pan on empty canvas
        this.setCursor("grabbing");
      }
    });
    el.addEventListener("pointermove", (ev: PointerEvent) => {
      if (this.touchGesture) return; // two-finger gesture owns the camera
      const gesture = this.pointerGesture;
      if (gesture && gesture.id !== ev.pointerId) return;
      const [sx, sy] = this.eventToScreen(ev);
      if (gesture) {
        const dx = ev.clientX - gesture.startX;
        const dy = ev.clientY - gesture.startY;
        if (dx * dx + dy * dy >= (NODE_DRAG_THRESHOLD_PX * uiScale()) ** 2) {
          this.dragMoved = true;
        }
      }
      if (this.pendingDragIndex >= 0) {
        if (this.dragMoved) {
          this.startNodeDrag(this.pendingDragIndex, sx, sy);
          this.setCursor("grabbing");
        }
        return;
      }
      if (this.dragNodeIndex >= 0) {
        if (this.frozen) return;
        const w = this.screenToWorld(sx, sy);
        this.solver?.setDrag(
          this.dragNodeIndex,
          w.x + this.dragOffset.x,
          w.y + this.dragOffset.y,
        );
        this.wake();
        return;
      }
      if (this.dragging) {
        const dx = ev.clientX - this.lastX;
        const dy = ev.clientY - this.lastY;
        this.lastX = ev.clientX;
        this.lastY = ev.clientY;
        // A camera pan is manual navigation: disengage autoframe so it does not yank the
        // view back when the drag ends (idempotent — suspends once).
        this.disengageAutoframeForUserNav();
        const ppw = this.pixelsPerWorld();
        this.camera.position.x -= dx / ppw;
        this.camera.position.y += dy / ppw;
        this.camera.updateProjectionMatrix();
        this.requestRender();
        return;
      }
      const hit = this.pickNodeAtScreen(sx, sy);
      this.setHovered(hit);
      this.setCursor(hit ? "grab" : "default");
    });
    const end = (ev: PointerEvent) => {
      this.dragging = false;
      this.pointerGesture = null;
      if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    };
    el.addEventListener("pointerup", (ev: PointerEvent) => {
      if (this.pointerGesture?.id !== ev.pointerId) return;
      if (this.dragNodeIndex >= 0 && !this.frozen) {
        // The release event can carry a newer endpoint than the last pointermove.
        const [sx, sy] = this.eventToScreen(ev);
        const w = this.screenToWorld(sx, sy);
        this.solver?.setDrag(
          this.dragNodeIndex,
          w.x + this.dragOffset.x,
          w.y + this.dragOffset.y,
        );
      }
      const draggedId = this.nodes[this.dragNodeIndex]?.id;
      const wasDrag = this.dragMoved;
      this.endNodeDrag();
      end(ev);
      this.setCursor("default");
      if (ev.button !== 0) return;
      // A click (no movement) selects; a node drag also selects the grabbed node.
      if (!wasDrag || draggedId !== undefined) {
        const [sx, sy] = this.eventToScreen(ev);
        this.controller?.emit({
          kind: "select",
          id: draggedId ?? this.pickNodeAtScreen(sx, sy),
        });
      }
    });
    el.addEventListener("pointercancel", (ev: PointerEvent) => {
      if (this.pointerGesture?.id !== ev.pointerId) return;
      this.endNodeDrag();
      end(ev);
      this.setCursor("default");
    });
    el.addEventListener("lostpointercapture", (ev: PointerEvent) => {
      if (this.pointerGesture?.id !== ev.pointerId) return;
      this.endNodeDrag();
      end(ev);
      this.setCursor("default");
    });
    el.addEventListener("dblclick", (ev: MouseEvent) => {
      const [sx, sy] = this.eventToScreen(ev);
      const id = this.pickNodeAtScreen(sx, sy);
      if (id) this.controller?.emit({ kind: "open", id });
    });
    el.addEventListener("contextmenu", (ev: MouseEvent) => {
      ev.preventDefault();
      const [sx, sy] = this.eventToScreen(ev);
      const id = this.pickNodeAtScreen(sx, sy);
      this.controller?.emit({
        kind: "context-menu",
        id,
        target: "node",
        clientX: ev.clientX,
        clientY: ev.clientY,
      });
    });
    el.addEventListener("pointerleave", () => {
      if (this.dragNodeIndex < 0) this.setHovered(null);
    });

    // Real touch devices (graph-trackpad-nav): a TWO-FINGER gesture pans by the centroid
    // delta (drag sense — the surface follows the fingers) and pinch-zooms by the spread
    // ratio toward the centroid. Single-finger touch still flows through the pointer
    // handlers above (tap = select, one-finger drag = pan). The gesture suppresses the
    // pointer pan via `touchGesture` so the two never fight.
    el.addEventListener(
      "touchstart",
      (ev: TouchEvent) => {
        if (ev.touches.length !== 2) return;
        ev.preventDefault();
        this.endNodeDrag();
        this.cancelInteraction();
        this.touchGesture = true;
        this.lastTouchCentroid = this.touchCentroid(ev.touches);
        this.lastTouchDist = this.touchDistance(ev.touches);
      },
      { passive: false },
    );
    el.addEventListener(
      "touchmove",
      (ev: TouchEvent) => {
        if (!this.touchGesture || ev.touches.length < 2) return;
        ev.preventDefault();
        const centroid = this.touchCentroid(ev.touches);
        const dist = this.touchDistance(ev.touches);
        if (this.lastTouchCentroid) {
          const ppw = this.pixelsPerWorld();
          const dcx = centroid.x - this.lastTouchCentroid.x;
          const dcy = centroid.y - this.lastTouchCentroid.y;
          // Drag sense: surface follows the fingers (camera moves opposite).
          this.panCamera(-dcx / ppw, dcy / ppw);
        }
        if (this.lastTouchDist > 0 && dist > 0) {
          const [sx, sy] = this.clientToScreen(centroid.x, centroid.y);
          this.zoomAtScreen(dist / this.lastTouchDist, sx, sy);
        }
        this.lastTouchCentroid = centroid;
        this.lastTouchDist = dist;
      },
      { passive: false },
    );
    const endTouch = (ev: TouchEvent) => {
      if (ev.touches.length < 2) {
        this.touchGesture = false;
        this.lastTouchCentroid = null;
        this.lastTouchDist = 0;
      }
    };
    el.addEventListener("touchend", endTouch);
    el.addEventListener("touchcancel", endTouch);
  }
}
