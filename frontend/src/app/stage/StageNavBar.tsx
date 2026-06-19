// The unified stage top bar (graph-timeline-workspace). The graph and timeline are
// now ONE element with two stacked sections and a fine-tunable buffer between them;
// this bar is that element's single top bar. ALL navigation lives here as horizontal
// items on the right — the graph camera cluster, the graph-settings gear, and the
// timeline zoom/fit/now cluster — so the canvas keeps only the minimap as an overlay
// and the timeline section needs no header of its own.
//
// The simplification deliberately RETIRES the prior chrome: there is no search field,
// no filter control or sidebar, no layout/representation "mode" switch, and no date
// range pills. Visual clarity over feature surface — the user drives the graph and
// timeline through plain navigation, not a filtering instrument.
//
// Layer ownership (dashboard-layer-ownership): leaf chrome over the preserved stores
// + SceneController seam. Camera buttons emit SceneController.command(); timeline
// buttons write the timeline view store and the canonical playhead intent. It fetches
// nothing of its own (the corpus date bounds come through the stores vocabulary hook)
// and reads no raw `tiers`. Tokens only; Lucide structural marks from the kit.

import { Clock } from "lucide-react";

import { IconButton, Maximize, Minus, Plus } from "../kit";
import { CreateDocButton } from "./CreateDocButton";
import { GraphNavButtons, GraphSettingsPopover } from "./GraphControls";
import { useActiveScope, useFiltersVocabularyView } from "../../stores/server/queries";
import { movePlayhead } from "../../stores/view/timelineIntent";
import {
  fitTimelineSpan,
  parseTimelineInstant,
  setTimelineScrollOffset,
  setTimelineViewport,
  TIMELINE_ZOOM_STEP,
  timelineCanZoomIn,
  timelineCanZoomOut,
  timelineJumpToEndOffset,
  timelineZoomViewport,
  useTimelineViewportState,
} from "../../stores/view/timeline";

// The timeline camera cluster — zoom in / out · fit the whole corpus · jump to now
// (returning the playhead to LIVE). Sized against the timeline's own measured
// viewport width (published by the Timeline surface into the view store), so the
// fit/zoom math matches the section it drives even though the bar sits above it.
function TimelineNavButtons() {
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabularyView(scope);
  const corpusBounds = vocabulary.dateBounds;
  const { pxPerMs, scrollOffset, viewportWidth } = useTimelineViewportState();
  const effectiveWidth = viewportWidth > 0 ? viewportWidth : 800;

  const zoomBy = (factor: number) => {
    const next = timelineZoomViewport(pxPerMs, scrollOffset, effectiveWidth, factor);
    setTimelineViewport(next.pxPerMs, next.scrollOffset);
  };
  const fitAll = () => {
    const from = parseTimelineInstant(corpusBounds?.from);
    const to = parseTimelineInstant(corpusBounds?.to, Date.now());
    if (!Number.isFinite(from)) return;
    const next = fitTimelineSpan(
      from,
      Number.isFinite(to) ? to : Date.now(),
      effectiveWidth,
    );
    setTimelineViewport(next.pxPerMs, next.scrollOffset);
  };
  const jumpToNow = () => {
    const toRaw = parseTimelineInstant(corpusBounds?.to, Date.now());
    const end = Number.isFinite(toRaw) ? toRaw : Date.now();
    setTimelineScrollOffset(timelineJumpToEndOffset(end, pxPerMs, effectiveWidth));
    movePlayhead("live", scope);
  };

  return (
    <div
      className="flex items-center gap-fg-0-5"
      role="group"
      aria-label="Timeline navigation"
      data-timeline-nav-group
    >
      <IconButton
        label="zoom in timeline"
        title="zoom in"
        disabled={!timelineCanZoomIn(pxPerMs)}
        onClick={() => zoomBy(TIMELINE_ZOOM_STEP)}
      >
        <Plus size={15} aria-hidden />
      </IconButton>
      <IconButton
        label="zoom out timeline"
        title="zoom out"
        disabled={!timelineCanZoomOut(pxPerMs)}
        onClick={() => zoomBy(1 / TIMELINE_ZOOM_STEP)}
      >
        <Minus size={15} aria-hidden />
      </IconButton>
      <span className="mx-fg-0-5 h-4 w-px bg-rule" aria-hidden />
      <IconButton label="fit timeline" title="fit the whole corpus" onClick={fitAll}>
        <Maximize size={15} aria-hidden />
      </IconButton>
      <IconButton
        label="jump to now"
        title="jump to the latest instant"
        onClick={jumpToNow}
      >
        <Clock size={15} aria-hidden />
      </IconButton>
    </div>
  );
}

export function StageNavBar() {
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-20 flex items-center gap-fg-2 border-b border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label"
      data-stage-nav-bar
    >
      <CreateDocButton />
      <span className="flex-1" />
      {/* All graph + timeline navigation, horizontal, right-aligned. */}
      <GraphNavButtons />
      <GraphSettingsPopover />
      <span className="mx-fg-1 h-5 w-px bg-rule" aria-hidden />
      <TimelineNavButtons />
    </div>
  );
}
