// The graph dockview panel (editor-dock-workspace P02/P04; appshell-reframe #11).
// It is ONE cohesive unit: a graph-rect placeholder on TOP plus the timeline
// tethered directly UNDER it, as a single bundled panel (the user's "graph +
// timeline = one panel" model). The graph-rect div is an empty placeholder that
// publishes its content rect to `canvasPin`; the actual graph (the whole Stage:
// canvas + chrome) is rendered by `GraphCanvasHost` floating over that rect, so
// dockview never re-parents the canvas. The timeline below it is plain DOM in the
// same panel, so the two move/resize together and hiding the graph hides the
// timeline with it.
//
// The placeholder is the rect source AND the visibility signal: while this panel
// is mounted the graph is visible; when dockview unmounts it (the graph toggled
// off), the canvas host hides (display:none — GL context preserved, never
// destroyed). Layer law: `app/` chrome over the preserved stores + SceneController
// contracts; no fetch, no raw tiers.

import { useEffect, useRef } from "react";
import type { IDockviewPanelProps } from "dockview";

import { ErrorBoundary } from "../../platform/errors/ErrorBoundary";
import { useActiveScope } from "../../stores/server/queries";
import { useShellFrameView } from "../../stores/view/shellLayout";
import { openContextMenu } from "../../stores/view/contextMenu";
import {
  backgroundContextMenuHandler,
  isTimelineBackgroundTarget,
} from "../menus/backgroundContextMenu";
import { Timeline } from "../timeline/Timeline";
import { setGraphVisible, trackGraphRect } from "./canvasPin";

export function GraphPanel(_props: IDockviewPanelProps) {
  const scope = useActiveScope();
  const shellFrame = useShellFrameView(scope);
  const { showTimeline, timelineClassName, timelineBodyClassName } = shellFrame;
  // The graph rect is the TOP sub-div only (the timeline sits below it in the same
  // panel), so the pinned canvas tracks the graph area, not the whole panel.
  const graphRectRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = graphRectRef.current;
    if (!el) return;
    setGraphVisible(true);
    const stop = trackGraphRect(el);
    return () => {
      stop();
      setGraphVisible(false);
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      {/* The graph area — transparent placeholder the canvas host paints over. */}
      <div
        ref={graphRectRef}
        data-graph-panel
        className="relative min-h-0 min-w-0 flex-1"
      />

      {/* The tethered timeline — the lower SECTION of the one graph+timeline panel
          (graph-timeline-workspace). Issue #14: the timeline is now a thin two-handle
          date-range selector that writes the canonical `date_range`; it is
          self-contained (reads its own scope) and takes no props. The section sizes to
          its single-row content (no fixed height, no resize) so it occupies the least
          space and the graph above takes the rest. */}
      {showTimeline && (
        <div className={timelineClassName} data-focus-region="timeline">
          <ErrorBoundary region="timeline">
            <div
              className={timelineBodyClassName}
              onContextMenu={backgroundContextMenuHandler(
                "timeline",
                openContextMenu,
                isTimelineBackgroundTarget,
              )}
            >
              <Timeline />
            </div>
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
