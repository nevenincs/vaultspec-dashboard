// The app-lifetime graph canvas host (editor-dock-workspace P02). Renders the
// UNCHANGED Stage (canvas + chrome) inside a single, app-lifetime DOM node that
// is positioned to track the graph dockview panel's rect (published by
// `canvasPin`). Because Stage lives here and this host is never re-parented,
// dockview never moves Stage's DOM — so the graph's WebGL context and the
// SceneController seam survive every dock, split, float, and re-dock. The
// dockview graph panel renders only an empty placeholder that publishes its rect
// (see `GraphPanel`); this host floats over that rect.
//
// This is the load-bearing contract of the workspace and is deliberately the
// LEAST invasive design: Stage is untouched (its canvas mount, chrome pointer
// model, and keyboard host are exactly as before), so nothing about the graph's
// interaction changes — only WHERE the whole Stage paints.
//
// Layer law: `app/` chrome over the preserved Stage / SceneController seam
// (view-rewrite-preserves-the-state-and-scene-contract). It issues no commands.

import { useEffect, useRef, useSyncExternalStore } from "react";

import { getGraphPin, subscribeGraphPin } from "./canvasPin";
import { Stage } from "./Stage";

export function GraphCanvasHost() {
  const pin = useSyncExternalStore(subscribeGraphPin, getGraphPin);
  const hostRef = useRef<HTMLDivElement>(null);

  // During a dockview panel drag, drop this host's pointer events so a panel
  // dragged OVER the graph area reaches dockview's drop targets beneath it (the
  // canvas would otherwise eat the dragover). dockview uses native HTML5 DnD for
  // tabs, so window drag start/end is the signal.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onDragStart = () => {
      host.style.pointerEvents = "none";
    };
    const onDragEnd = () => {
      host.style.pointerEvents = "";
    };
    window.addEventListener("dragstart", onDragStart, true);
    window.addEventListener("dragend", onDragEnd, true);
    window.addEventListener("drop", onDragEnd, true);
    return () => {
      window.removeEventListener("dragstart", onDragStart, true);
      window.removeEventListener("dragend", onDragEnd, true);
      window.removeEventListener("drop", onDragEnd, true);
    };
  }, []);

  const rect = pin.rect;
  const visible = pin.visible && rect !== null;

  return (
    <div
      ref={hostRef}
      data-graph-canvas-host
      aria-hidden={!visible}
      className="absolute"
      style={{
        left: rect ? `${rect.left}px` : 0,
        top: rect ? `${rect.top}px` : 0,
        width: rect ? `${rect.width}px` : 0,
        height: rect ? `${rect.height}px` : 0,
        // Above the dockview container (z-10) so the graph paints over the
        // (transparent) graph panel; opaque document panels sit in their own
        // groups and are never under this rect.
        zIndex: 20,
        display: visible ? "block" : "none",
      }}
    >
      <Stage />
    </div>
  );
}
