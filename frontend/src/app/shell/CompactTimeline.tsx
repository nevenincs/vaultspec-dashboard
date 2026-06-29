// Compact timeline minimode (mobile-responsive-layout ADR D2t; binding Figma
// `Timeline minimode` frame 792:3322). On compact the timeline is the SAME fixed
// two-handle date-range selector as the desktop footer — one shared core
// (`app/timeline/TimelineRange`, design-system-is-centralized) rendered with the
// `compact` variant. It writes the canonical `date_range` (the timeline is the SOLE
// date-range writer — filtering-has-one-canonical-surface), so narrowing the range
// narrows the rail/graph in lock-step.
//
// Layer law (dashboard-layer-ownership): dumb chrome — the shared component reads the
// served corpus span + canonical date_range and writes through the dashboard-state
// mutation seam; it fetches nothing and reads no raw `tiers`.

import { TimelineRange } from "../timeline/TimelineRangeSelector";

export function CompactTimeline({ scope }: { scope: unknown }) {
  return <TimelineRange scope={scope} variant="compact" />;
}
