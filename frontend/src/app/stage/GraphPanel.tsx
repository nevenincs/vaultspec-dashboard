// The graph dockview panel (editor-dock-workspace P02/P04). Renders ONLY an
// empty placeholder that publishes its content rect to `canvasPin`; the actual
// graph (the whole Stage: canvas + chrome) is rendered by `GraphCanvasHost`
// floating over this rect, so dockview never re-parents the canvas. Transparent
// because the canvas host paints over it.
//
// The placeholder is the rect source AND the visibility signal: while this panel
// is mounted the graph is visible; when dockview unmounts it (the graph closed),
// the canvas host hides.

import { useEffect, useRef } from "react";
import type { IDockviewPanelProps } from "dockview";

import { setGraphVisible, trackGraphRect } from "./canvasPin";

export function GraphPanel(_props: IDockviewPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setGraphVisible(true);
    const stop = trackGraphRect(el);
    return () => {
      stop();
      setGraphVisible(false);
    };
  }, []);
  return <div ref={ref} data-graph-panel className="h-full w-full" />;
}
