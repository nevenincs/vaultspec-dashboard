// The portal-pinned canvas bridge (editor-dock-workspace P02). The load-bearing
// contract of the dock workspace: the Pixi graph `<canvas>` is mounted ONCE into
// an app-lifetime host and is NEVER re-parented, because re-parenting a canvas
// destroys its WebGL context and the SceneController seam. dockview is free to
// move, split, float, and re-dock the graph PANEL; this bridge tracks that
// panel's placeholder rect and the canvas host positions itself to match, so the
// canvas DOM node stays put while only its on-screen rect follows the panel.
//
// Layer law: this is `app/`-layer chrome plumbing. It carries no wire access and
// reads no `tiers`; it only measures DOM rects and broadcasts them.
//
// Bounded-by-default: the measure loop is a SETTLE loop, not a permanent rAF. A
// trigger (resize, scroll, or an explicit dock-layout poke) starts it; it stops
// once the rect has been stable for a few frames, so an idle workspace spins no
// animation frame and the graph's render-on-demand idle is preserved.

export interface GraphRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PinState {
  /** The graph panel's content rect, RELATIVE to the workspace container's
   *  top-left (so the absolutely-positioned canvas host can place itself with
   *  plain left/top). Null when no graph panel is mounted. */
  rect: GraphRect | null;
  /** Whether the graph panel is currently mounted/visible. The canvas host hides
   *  (display:none, not destroy) when false so a closed graph costs no GPU. */
  visible: boolean;
}

// The snapshot is replaced (never mutated) on every change so a React
// `useSyncExternalStore` consumer sees a new reference and re-renders.
let snapshot: PinState = { rect: null, visible: false };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function rectsEqual(a: GraphRect | null, b: GraphRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
  );
}

/** Read the current pin snapshot (stable reference until the next change). */
export function getGraphPin(): Readonly<PinState> {
  return snapshot;
}

/** Subscribe to pin changes; returns an unsubscribe. */
export function subscribeGraphPin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setRect(rect: GraphRect | null): void {
  if (rectsEqual(snapshot.rect, rect)) return;
  snapshot = { rect, visible: snapshot.visible };
  emit();
}

/** Mark the graph panel mounted/unmounted. Called by the graph panel on mount
 *  and unmount; clears the rect when hidden so a stale rect cannot linger. */
export function setGraphVisible(visible: boolean): void {
  if (snapshot.visible === visible) return;
  snapshot = { rect: visible ? snapshot.rect : null, visible };
  emit();
}

// The workspace container element — the positioned DockWorkspace root that both
// the canvas host and the dockview panels descend from. Rects are published
// RELATIVE to it so the absolutely-positioned canvas host can place itself with
// plain left/top. Registered by the workspace so the graph panel placeholder
// need not thread the ref through dockview's panel boundary.
let workspaceContainer: HTMLElement | null = null;

export function setWorkspaceContainer(el: HTMLElement | null): void {
  workspaceContainer = el;
}

/**
 * Track `el`'s rect relative to the registered workspace container, publishing
 * it to the pin. Wires a ResizeObserver on the element plus window resize/scroll,
 * and runs a bounded settle loop on every trigger so dockview moves that shift
 * the panel WITHOUT resizing it (a sibling sash drag, an animated split) are
 * still followed to a pixel. Returns a cleanup that tears everything down.
 */
export function trackGraphRect(el: HTMLElement): () => void {
  const container = workspaceContainer ?? (el.offsetParent as HTMLElement) ?? el;
  let frame = 0;
  let stableFrames = 0;
  let stopped = false;

  const measure = (): GraphRect => {
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      left: elRect.left - containerRect.left,
      top: elRect.top - containerRect.top,
      width: elRect.width,
      height: elRect.height,
    };
  };

  const tick = (): void => {
    if (stopped) return;
    const next = measure();
    if (rectsEqual(snapshot.rect, next)) {
      // Stable: stop after a short grace so an animated dock transition that
      // briefly pauses does not strand the canvas mid-move.
      stableFrames += 1;
      if (stableFrames >= 6) {
        frame = 0;
        return;
      }
    } else {
      stableFrames = 0;
      setRect(next);
    }
    frame = requestAnimationFrame(tick);
  };

  /** Restart the settle loop (idempotent while one is running). */
  const poke = (): void => {
    stableFrames = 0;
    if (!frame) frame = requestAnimationFrame(tick);
  };

  const resizeObserver = new ResizeObserver(poke);
  resizeObserver.observe(el);
  resizeObserver.observe(container);
  window.addEventListener("resize", poke);
  window.addEventListener("scroll", poke, true);
  // Register this tracker's poke so the dock workspace can re-measure on a
  // layout change that resizes nothing observable (a dock/move/split).
  activePoke = poke;

  // Prime the rect synchronously so the canvas places itself on first paint.
  setRect(measure());
  poke();

  return () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    window.removeEventListener("resize", poke);
    window.removeEventListener("scroll", poke, true);
    if (activePoke === poke) activePoke = null;
  };
}

// Module-level remeasure hook so the dock workspace can poke the active tracker
// on `onDidLayoutChange` (a dock/move/split that resizes nothing observable).
let activePoke: (() => void) | null = null;

/** Re-measure the graph rect now (called from the workspace layout-change hook). */
export function pokeGraphRect(): void {
  activePoke?.();
}
