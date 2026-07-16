import type { FacetDotTone } from "../../app/kit/FacetRow";
import type { MessageDescriptor } from "../../platform/localization/message";

export type FilterOptionLabel =
  | { readonly kind: "message"; readonly descriptor: MessageDescriptor }
  | { readonly kind: "authored"; readonly value: string };

export function filterMessageLabel(descriptor: MessageDescriptor): FilterOptionLabel {
  return Object.freeze({ kind: "message", descriptor });
}

export function authoredFilterLabel(value: string): FilterOptionLabel {
  return Object.freeze({ kind: "authored", value });
}

type FilterMessageKey =
  | "graph:filters.accessibility.panel"
  | "graph:filters.actions.clearAll"
  | "graph:filters.actions.reset"
  | "graph:filters.actions.showResults"
  | "graph:filters.edited.any"
  | "graph:filters.edited.lastSevenDays"
  | "graph:filters.edited.lastThirtyDays"
  | "graph:filters.edited.thisYear"
  | "graph:filters.health.dangling"
  | "graph:filters.health.emptyScaffold"
  | "graph:filters.health.invalid"
  | "graph:filters.health.orphaned"
  | "graph:filters.options.adr"
  | "graph:filters.options.audit"
  | "graph:filters.options.exec"
  | "graph:filters.options.plan"
  | "graph:filters.options.reference"
  | "graph:filters.options.research"
  | "graph:filters.options.summary"
  | "graph:filters.search.features"
  | "graph:filters.sections.decisionStatus"
  | "graph:filters.sections.edited"
  | "graph:filters.sections.feature"
  | "graph:filters.sections.health"
  | "graph:filters.sections.kind"
  | "graph:filters.sections.planStatus"
  | "graph:filters.states.empty"
  | "graph:filters.states.loading"
  | "graph:filters.statuses.accepted"
  | "graph:filters.statuses.active"
  | "graph:filters.statuses.archived"
  | "graph:filters.statuses.complete"
  | "graph:filters.statuses.deprecated"
  | "graph:filters.statuses.draft"
  | "graph:filters.statuses.finished"
  | "graph:filters.statuses.inProgress"
  | "graph:filters.statuses.notStarted"
  | "graph:filters.statuses.proposed"
  | "graph:filters.statuses.rejected"
  | "graph:filters.compactTitle"
  | "graph:filters.title";

const message = <Key extends FilterMessageKey>(key: Key): MessageDescriptor<Key> =>
  Object.freeze({ key });

export const FILTER_MESSAGES = Object.freeze({
  panel: message("graph:filters.accessibility.panel"),
  clearAll: message("graph:filters.actions.clearAll"),
  reset: message("graph:filters.actions.reset"),
  showResults: message("graph:filters.actions.showResults"),
  loading: message("graph:filters.states.loading"),
  empty: message("graph:filters.states.empty"),
  compactTitle: message("graph:filters.compactTitle"),
  title: message("graph:filters.title"),
  sections: Object.freeze({
    decisionStatus: message("graph:filters.sections.decisionStatus"),
    edited: message("graph:filters.sections.edited"),
    feature: message("graph:filters.sections.feature"),
    health: message("graph:filters.sections.health"),
    kind: message("graph:filters.sections.kind"),
    planStatus: message("graph:filters.sections.planStatus"),
  }),
  searchFeatures: message("graph:filters.search.features"),
  edited: Object.freeze({
    any: message("graph:filters.edited.any"),
    "7d": message("graph:filters.edited.lastSevenDays"),
    "30d": message("graph:filters.edited.lastThirtyDays"),
    year: message("graph:filters.edited.thisYear"),
  }),
  options: Object.freeze({
    research: message("graph:filters.options.research"),
    adr: message("graph:filters.options.adr"),
    plan: message("graph:filters.options.plan"),
    exec: message("graph:filters.options.exec"),
    audit: message("graph:filters.options.audit"),
    reference: message("graph:filters.options.reference"),
    summary: message("graph:filters.options.summary"),
  }),
});

export interface FilterTokenPresentation {
  readonly label: MessageDescriptor<FilterMessageKey>;
  readonly dot?: FacetDotTone;
}

const STATUS_PRESENTATION = Object.freeze({
  accepted: { label: message("graph:filters.statuses.accepted"), dot: "complete" },
  finished: { label: message("graph:filters.statuses.finished"), dot: "complete" },
  complete: { label: message("graph:filters.statuses.complete"), dot: "complete" },
  proposed: { label: message("graph:filters.statuses.proposed"), dot: "provisional" },
  draft: { label: message("graph:filters.statuses.draft"), dot: "provisional" },
  "in-progress": {
    label: message("graph:filters.statuses.inProgress"),
    dot: "active",
  },
  active: { label: message("graph:filters.statuses.active"), dot: "active" },
  "not-started": {
    label: message("graph:filters.statuses.notStarted"),
    dot: "stale",
  },
  rejected: { label: message("graph:filters.statuses.rejected"), dot: "broken" },
  deprecated: {
    label: message("graph:filters.statuses.deprecated"),
    dot: "archived",
  },
  archived: { label: message("graph:filters.statuses.archived"), dot: "archived" },
} as const satisfies Readonly<Record<string, FilterTokenPresentation>>);

const PLAN_STATUS_PRESENTATION = Object.freeze({
  "not-started": STATUS_PRESENTATION["not-started"],
  "in-progress": STATUS_PRESENTATION["in-progress"],
  finished: STATUS_PRESENTATION.finished,
});

const HEALTH_PRESENTATION = Object.freeze({
  dangling: { label: message("graph:filters.health.dangling"), dot: "broken" },
  invalid: { label: message("graph:filters.health.invalid"), dot: "danger" },
  "empty-scaffold": {
    label: message("graph:filters.health.emptyScaffold"),
    dot: "stale",
  },
  orphaned: { label: message("graph:filters.health.orphaned"), dot: "archived" },
} as const satisfies Readonly<Record<string, FilterTokenPresentation>>);

function exactPresentation(
  map: Readonly<Record<string, FilterTokenPresentation>>,
  value: unknown,
): FilterTokenPresentation | null {
  return typeof value === "string" && Object.hasOwn(map, value) ? map[value] : null;
}

export function filterStatusPresentation(
  value: unknown,
): FilterTokenPresentation | null {
  return exactPresentation(STATUS_PRESENTATION, value);
}

export function filterPlanStatusPresentation(
  value: unknown,
): FilterTokenPresentation | null {
  return exactPresentation(PLAN_STATUS_PRESENTATION, value);
}

export function filterHealthPresentation(
  value: unknown,
): FilterTokenPresentation | null {
  return exactPresentation(HEALTH_PRESENTATION, value);
}
