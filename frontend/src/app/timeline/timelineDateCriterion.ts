// The timeline date CRITERION vocabulary (Issue #14): which date field the range
// selector's edges + the date_range filter key off. The engine serves and filters
// by `created` (frontmatter `date:`) only today — the corpus `date_bounds` and the
// `created_in_range` predicate both key off `created`. `modified` (worktree mtime)
// is served on nodes but is not a filter facet; `stamped` (frontmatter `modified:`
// CLI stamp) is not served at all. Both need engine work (flagged to the engine
// owner): a `date_field` selector on the `Filter` grammar, per-criterion
// `date_bounds`, the new `stamped` ingest field, AND a schema-driven
// `timeline_date_criterion` setting as the persistent home (settings-are-schema-
// driven-from-one-registry). Until then this is the single source the range
// selector's hint and the "Filter by" context menu both read; non-served criteria
// render disabled-with-reason rather than as a lie (display-state-is-backend-served).

export type TimelineDateCriterion = "created" | "modified" | "stamped";

export interface TimelineDateCriterionMeta {
  id: TimelineDateCriterion;
  /** User-facing plain label (ui-labels-are-user-facing). */
  label: string;
  /** Whether the engine serves + filters by this criterion today. */
  served: boolean;
  /** Why it is unavailable, when not served (honest disabled reason). */
  unavailableReason?: string;
}

export const TIMELINE_DATE_CRITERIA: readonly TimelineDateCriterionMeta[] = [
  { id: "created", label: "Created", served: true },
  {
    id: "modified",
    label: "Modified",
    served: false,
    unavailableReason: "available once the backend serves modified dates",
  },
  {
    id: "stamped",
    label: "Stamped",
    served: false,
    unavailableReason: "available once the backend serves the stamped field",
  },
];

/** The active criterion. Pinned to the only end-to-end served field until the
 *  engine serves the others + a persisted `timeline_date_criterion` setting. */
export const TIMELINE_DATE_CRITERION_DEFAULT: TimelineDateCriterion = "created";

export function timelineDateCriterionLabel(id: TimelineDateCriterion): string {
  return (
    TIMELINE_DATE_CRITERIA.find((c) => c.id === id)?.label ??
    TIMELINE_DATE_CRITERIA[0].label
  );
}
