// The dashboard timeline (Issue #14 rebuild). The scrolling diachronic lineage view
// — dots, lanes, axis, playhead, range-drag, minimap — was TORN DOWN; no visual
// element of it survives. The timeline is now a FIXED two-handle date-range selector
// (`./TimelineRange`): left edge = oldest vault document, right edge = latest, and
// the chosen start/end IS the canonical `date_range` filter, synced across the rail
// and graph (filtering-has-one-canonical-surface — the timeline is the sole
// date_range writer).
//
// This file stays the stable mount export `Timeline`. It is self-contained: it reads
// the active scope itself and writes the date_range through the canonical seam inside
// `TimelineRange`. The legacy `onNodeClick` / `overlay` props are accepted but
// IGNORED — there are no marks to click and no playhead overlay — kept optional only
// so a mount site mid-relocation (the graph+timeline panel consolidation) still
// type-checks; the clean mount is prop-free `<Timeline />`.
//
// Layer law (dashboard-layer-ownership): app-chrome over the preserved stores
// contracts; it fetches nothing and reads no raw `tiers` block.

import { useActiveScope } from "../../stores/server/queries";
import { TimelineRange } from "./TimelineRangeSelector";

export interface TimelineSurfaceProps {
  /** Legacy, ignored — retained optional for drop-in mount compatibility. */
  onNodeClick?: unknown;
  /** Legacy, ignored — the playhead overlay was removed in the rebuild. */
  overlay?: React.ReactNode;
}

export function Timeline(_props: TimelineSurfaceProps = {}) {
  const scope = useActiveScope();
  return <TimelineRange scope={scope} variant="desktop" />;
}
