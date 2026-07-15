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

import type { MessageDescriptor } from "../../platform/localization/message";

export type TimelineDateCriterion = "created" | "modified" | "stamped";

type TimelineDateCriterionLabelKey =
  | "timeline:criteria.created"
  | "timeline:criteria.modified"
  | "timeline:criteria.stamped";
type TimelineDateCriterionFilterActionKey =
  | "timeline:actions.filterByCreationDate"
  | "timeline:actions.filterByEditDate"
  | "timeline:actions.filterByUpdateDate";
type TimelineDateCriterionCurrentFilterActionKey =
  | "timeline:actions.filterByCreationDateCurrent"
  | "timeline:actions.filterByEditDateCurrent"
  | "timeline:actions.filterByUpdateDateCurrent";
type TimelineDateCriterionRangeDescriptionKey =
  | "timeline:descriptions.useCreationDateForRange"
  | "timeline:descriptions.useEditDateForRange"
  | "timeline:descriptions.useUpdateDateForRange";
interface TimelineDateCriterionPresentationBase<
  Criterion extends TimelineDateCriterion,
  LabelKey extends TimelineDateCriterionLabelKey,
  FilterActionKey extends TimelineDateCriterionFilterActionKey,
  CurrentFilterActionKey extends TimelineDateCriterionCurrentFilterActionKey,
  RangeDescriptionKey extends TimelineDateCriterionRangeDescriptionKey,
> {
  readonly id: Criterion;
  readonly label: MessageDescriptor<LabelKey>;
  readonly filterActionLabel: MessageDescriptor<FilterActionKey>;
  readonly currentFilterActionLabel: MessageDescriptor<CurrentFilterActionKey>;
  readonly rangeDescription: MessageDescriptor<RangeDescriptionKey>;
}

export type TimelineDateCriterionPresentation =
  | (TimelineDateCriterionPresentationBase<
      "created",
      "timeline:criteria.created",
      "timeline:actions.filterByCreationDate",
      "timeline:actions.filterByCreationDateCurrent",
      "timeline:descriptions.useCreationDateForRange"
    > & {
      readonly requiresServedSetting: false;
      readonly unavailableReason: null;
    })
  | (TimelineDateCriterionPresentationBase<
      "modified",
      "timeline:criteria.modified",
      "timeline:actions.filterByEditDate",
      "timeline:actions.filterByEditDateCurrent",
      "timeline:descriptions.useEditDateForRange"
    > & {
      readonly requiresServedSetting: true;
      readonly unavailableReason: MessageDescriptor<"timeline:disabledReasons.modifiedUnavailable">;
    })
  | (TimelineDateCriterionPresentationBase<
      "stamped",
      "timeline:criteria.stamped",
      "timeline:actions.filterByUpdateDate",
      "timeline:actions.filterByUpdateDateCurrent",
      "timeline:descriptions.useUpdateDateForRange"
    > & {
      readonly requiresServedSetting: true;
      readonly unavailableReason: MessageDescriptor<"timeline:disabledReasons.stampedUnavailable">;
    });

type TimelineDateCriterionPresentationMap = Readonly<{
  [Criterion in TimelineDateCriterion]: Extract<
    TimelineDateCriterionPresentation,
    { readonly id: Criterion }
  >;
}>;

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

export const TIMELINE_DATE_CRITERION_PRESENTATION = Object.freeze({
  created: Object.freeze({
    id: "created",
    label: descriptor("timeline:criteria.created"),
    filterActionLabel: descriptor("timeline:actions.filterByCreationDate"),
    currentFilterActionLabel: descriptor(
      "timeline:actions.filterByCreationDateCurrent",
    ),
    rangeDescription: descriptor("timeline:descriptions.useCreationDateForRange"),
    requiresServedSetting: false,
    unavailableReason: null,
  }),
  modified: Object.freeze({
    id: "modified",
    label: descriptor("timeline:criteria.modified"),
    filterActionLabel: descriptor("timeline:actions.filterByEditDate"),
    currentFilterActionLabel: descriptor("timeline:actions.filterByEditDateCurrent"),
    rangeDescription: descriptor("timeline:descriptions.useEditDateForRange"),
    requiresServedSetting: true,
    unavailableReason: descriptor("timeline:disabledReasons.modifiedUnavailable"),
  }),
  stamped: Object.freeze({
    id: "stamped",
    label: descriptor("timeline:criteria.stamped"),
    filterActionLabel: descriptor("timeline:actions.filterByUpdateDate"),
    currentFilterActionLabel: descriptor("timeline:actions.filterByUpdateDateCurrent"),
    rangeDescription: descriptor("timeline:descriptions.useUpdateDateForRange"),
    requiresServedSetting: true,
    unavailableReason: descriptor("timeline:disabledReasons.stampedUnavailable"),
  }),
} as const satisfies TimelineDateCriterionPresentationMap);

export const TIMELINE_DATE_CRITERION_MESSAGES = Object.freeze({
  codeFiles: descriptor("timeline:disabledReasons.codeFiles"),
  current: descriptor("timeline:disabledReasons.current"),
  dateField: descriptor("timeline:accessibility.dateField"),
});

/** Raw identity and order stay independent from locale-specific presentation. */
export const TIMELINE_DATE_CRITERIA = Object.freeze([
  "created",
  "modified",
  "stamped",
]) satisfies readonly TimelineDateCriterion[];

/** Resolve presentation only for an exact raw criterion identity. */
export function timelineDateCriterionPresentation(
  value: unknown,
): TimelineDateCriterionPresentation | null {
  return value === "created" || value === "modified" || value === "stamped"
    ? TIMELINE_DATE_CRITERION_PRESENTATION[value]
    : null;
}

/** Apply the live setting capability to an exact criterion identity. */
export function timelineDateCriterionIsAvailable(
  value: unknown,
  settingServed: boolean,
): boolean {
  const presentation = timelineDateCriterionPresentation(value);
  return (
    presentation !== null && (!presentation.requiresServedSetting || settingServed)
  );
}

/** The active criterion. Pinned to the only end-to-end served field until the
 *  engine serves the others + a persisted `timeline_date_criterion` setting. */
export const TIMELINE_DATE_CRITERION_DEFAULT: TimelineDateCriterion = "created";

export function timelineDateCriterionLabel(
  id: TimelineDateCriterion,
): MessageDescriptor<TimelineDateCriterionLabelKey> {
  return TIMELINE_DATE_CRITERION_PRESENTATION[id].label;
}
