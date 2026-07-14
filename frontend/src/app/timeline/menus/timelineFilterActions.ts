// The timeline "Filter by" criterion actions (Issue #14): the empty-space context
// menu group that chooses WHICH date field the range selector's edges + the
// date_range filter key off — Created / Modified / Stamped. Authored ONCE here as a
// shared ActionDescriptor set (context-menu-actions-are-layered) and composed into
// the background (empty-space) menu for the `timeline` region.
//
// Honest state (display-state-is-backend-served-not-frontend-derived): the engine
// serves + filters by `created` only today, so it renders as the CURRENT criterion
// (disabled — already active) while `modified`/`stamped` render disabled-with-reason
// until the engine serves them (fixer-1: the `stamped` ingest field, per-criterion
// `date_bounds`, the `Filter.date_field` selector, and the persistent
// `timeline_date_criterion` setting). When that lands, the active criterion is read
// from the setting and the served criteria become runnable (one source: the
// `timelineDateCriterion` vocabulary).

import { legacyActionPresentation } from "../../../platform/actions/action";
import { Calendar, Clock, Stamp } from "lucide-react";

import type { ActionDescriptor, ActionIcon } from "../../../platform/actions/action";
import {
  setTimelineDateCriterion,
  timelineDateCriterionSnapshot,
} from "../../../stores/server/timelineDateCriterionIntent";
import {
  TIMELINE_DATE_CRITERIA,
  type TimelineDateCriterion,
} from "../timelineDateCriterion";

const CRITERION_ICON: Record<TimelineDateCriterion, ActionIcon> = {
  created: Calendar,
  modified: Clock,
  stamped: Stamp,
};

/**
 * The "Filter by" criterion descriptors. The active criterion + capability are read
 * from the engine-served `timeline_date_criterion` setting (via the cache snapshot);
 * selecting a criterion writes that setting. Every item carries section `transform`
 * (it changes how the corpus is narrowed), grouped under its own divider in the
 * timeline background menu. When the engine does not serve the setting (`served`
 * false), `created` is the only choice and Modified/Stamped render disabled-with-reason.
 */
export function timelineDateCriterionActions(): ActionDescriptor[] {
  const { active, served } = timelineDateCriterionSnapshot();
  return TIMELINE_DATE_CRITERIA.map((criterion) => {
    const base = {
      id: `timeline:filter-by:${criterion.id}`,
      label: legacyActionPresentation(`Filter by ${criterion.label}`),
      section: "transform" as const,
      icon: CRITERION_ICON[criterion.id],
    };
    if (criterion.id === active) {
      return {
        ...base,
        label: legacyActionPresentation(`Filter by ${criterion.label} (current)`),
        disabled: true,
        disabledReason: legacyActionPresentation("current date criterion"),
      };
    }
    // `created` is always available; modified/stamped only once the engine serves
    // the setting (capability gate) — otherwise honest disabled-with-reason.
    if (criterion.id !== "created" && !served) {
      return {
        ...base,
        disabled: true,
        disabledReason: legacyActionPresentation(
          criterion.unavailableReason ?? "not available yet",
        ),
      };
    }
    return { ...base, run: () => void setTimelineDateCriterion(criterion.id) };
  });
}
