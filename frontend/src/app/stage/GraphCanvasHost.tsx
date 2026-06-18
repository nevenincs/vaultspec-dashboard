// The app-lifetime graph canvas host (editor-dock-workspace P02). Mounts the
// Pixi field ONCE into a stable DOM node that is never re-parented, and
// positions that node to track the graph dockview panel's rect (published by
// `canvasPin`). dockview moves the graph PANEL freely; this host stays put in
// the DOM, so the WebGL context and the SceneController seam survive every dock,
// split, float, and re-dock — the load-bearing contract of the workspace.
//
// This host owns the canvas lifecycle (mount / resize / destroy) that `Stage`
// used to own; `Stage` is now pure chrome rendered inside the graph panel. The
// host is focusable and is the keyboard graph-walk target (pointer + keyboard
// both live where the canvas is); the panel placeholder is a pointer-transparent
// rect source above this host, and pointer events on empty graph area fall
// through it to the canvas.
//
// Layer law: this is `app/` chrome over the preserved SceneController seam
// (view-rewrite-preserves-the-state-and-scene-contract). It mounts the singleton
// scene and issues no commands of its own beyond mount/resize/destroy.

import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  getGraphPin,
  setCanvasHostEl,
  subscribeGraphPin,
} from "./canvasPin";
import { getScene } from "./Stage";

export function GraphCanvasHost() {
  const hostRef = useRef<HTMLDivElement>(null);
  const pin = useSyncExternalStore(subscribeGraphPin, getGraphPin);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = getScene();
    // Mount the field into the stable host. This is the ONE mount for the app
    // lifetime; the host is never re-parented, so the canvas context persists.
    scene.controller.mount(host);
    setCanvasHostEl(host);
    // Dev-only seam handle for the test harness (moved here from Stage with the
    // canvas mount). Never exposed in a production build.
    if (import.meta.env.DEV) {
      (globalThis as unknown as { __scene?: typeof scene }).__scene = scene;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) scene.controller.resize(rect.width, rect.height);
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      setCanvasHostEl(null);
      scene.controller.destroy();
    };
  }, []);

  const rect = pin.rect;
  const visible = pin.visible && rect !== null;

  return (
    <div
      ref={hostRef}
      data-graph-canvas-host
      // Focusable surface for the keyboard graph-walk (the chrome binds the walk
      // to this element via `getCanvasHostEl`); pointer events land here so Pixi
      // interaction works and a click focuses it for keyboard operability.
      tabIndex={visible ? 0 : -1}
      role="application"
      aria-label="node canvas — arrow keys walk the graph, Enter opens, e expands"
      aria-hidden={!visible}
      className="absolute outline-none focus-visible:ring-2 focus-visible:ring-state-active/40"
      style={{
        left: rect ? `${rect.left}px` : 0,
        top: rect ? `${rect.top}px` : 0,
        width: rect ? `${rect.width}px` : 0,
        height: rect ? `${rect.height}px` : 0,
        // Beneath the dockview chrome (z-0); the graph panel placeholder above is
        // pointer-transparent so empty-area events reach this canvas, and opaque
        // document panels cover it where they sit.
        zIndex: 0,
        display: visible ? "block" : "none",
      }}
    />
  );
}
