// Shared FEATURE-row presentation: the served roster metadata a feature row
// renders — its plan-state mark, its binding-decision date span, and its per-type
// composition line.
//
// One primitive, three readers: the rail's Features section rows (TreeBrowser),
// the feature search suggestions (FeatureSearchField), and the rail filter field
// that hosts them. All three consume the ONE scope-keyed feature-roster query, so
// none of this costs a per-row fetch.
//
// Presentation ONLY, per the wire contract: every value here arrives already
// computed by the engine over the FULL corpus (`type_counts`, the `plan_state`
// rollup, the `adr_dates` span). Nothing in this module counts, rolls up, or
// dates anything — it maps a served token to a mark, a tone, and plain language.
// A field the wire did not carry is UNKNOWN and renders as nothing at all; an
// unrecognised token fails closed the same way, so an older engine (or a future
// vocabulary) degrades to a quiet row rather than a wrong one.
//
// No React and no wire access, which is what lets the localization suite import
// it directly and assert every key resolves without rendering a tree.

import type { LocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { formatList } from "../../platform/localization/formatters";
import type { MessageDescriptor } from "../../platform/localization/message";
import { createCountMessageDescriptor } from "../../platform/localization/message";
import type { FeatureAdrDates, FeatureRosterEntry } from "../../stores/server/engine";
import { PIPELINE_COVERAGE_DOC_TYPES } from "../../stores/server/engine";
import { formatTreeDate, type PlanStatus } from "./vaultRowPresentation";

/** The engine's plan-completion vocabulary (`filter::plan_completion_from_progress`,
 *  rolled up per feature) → the rail's already-sanctioned plan-status marks. The
 *  mark family is the one tree rows use, so a feature and its plans never speak in
 *  two shapes. An unknown token maps to null: the row keeps its feature glyph
 *  rather than guessing a status. */
const FEATURE_PLAN_STATES: Record<string, PlanStatus> = {
  finished: "complete",
  "in-progress": "in-progress",
  "not-started": "not-started",
};

/**
 * The plan status a served feature rollup presents as, or null when the feature
 * carries no readable plan state (no plan, or a token this build does not know).
 * Null is the honest "no plan" case the ADR reserves the plain feature glyph for.
 */
export function featurePlanStatus(planState: string | undefined): PlanStatus | null {
  return planState === undefined ? null : (FEATURE_PLAN_STATES[planState] ?? null);
}

/** The accessible word for a feature's plan-state rollup. Distinct copy from a
 *  single plan's status (a feature may hold several), keyed by the presented
 *  status so the mark and its name can never disagree. */
export const FEATURE_PLAN_STATUS_MESSAGES = {
  complete: { key: "documents:accessibility.featurePlansFinished" },
  "in-progress": { key: "documents:accessibility.featurePlansInProgress" },
  "not-started": { key: "documents:accessibility.featurePlansNotStarted" },
} as const satisfies Record<PlanStatus, MessageDescriptor>;

/** Per-doc-type counted copy, in the canonical pipeline order the engine serves
 *  and the coverage adapter iterates. Authored as literal pairs (not a key built
 *  from the doc type) so every message key stays statically resolvable. */
const FEATURE_TYPE_COUNT_KEYS = {
  research: "documents:tree.featureResearchCount",
  reference: "documents:tree.featureReferenceCount",
  adr: "documents:tree.featureDecisionCount",
  plan: "documents:tree.featurePlanCount",
  exec: "documents:tree.featureStepCount",
  audit: "documents:tree.featureAuditCount",
} as const satisfies Record<(typeof PIPELINE_COVERAGE_DOC_TYPES)[number], string>;

/**
 * The composition line: the feature's SERVED per-type counts in canonical
 * pipeline order, joined as a locale-correct list ("1 research note, 2 decisions,
 * 1 plan"). Types with no document are omitted (the wire omits them, and a line
 * of zeroes says nothing). Empty string when the engine served no composition at
 * all — the row then shows no line rather than claiming the feature is empty.
 */
export function featureCompositionLabel(
  locale: string,
  typeCounts: Readonly<Record<string, number>> | undefined,
  resolveMessage: LocalizedMessageResolver,
): string {
  if (typeCounts === undefined) return "";
  const parts: string[] = [];
  for (const docType of PIPELINE_COVERAGE_DOC_TYPES) {
    const count = typeCounts[docType];
    if (count === undefined || count < 1) continue;
    const descriptor = createCountMessageDescriptor(
      FEATURE_TYPE_COUNT_KEYS[docType],
      count,
    );
    if (descriptor === null) continue;
    const resolved = resolveMessage(descriptor);
    if (!resolved.usedFallback) parts.push(resolved.message);
  }
  if (parts.length === 0) return "";
  return formatList(locale, parts, { type: "unit", style: "short" }) ?? "";
}

/** Do both ends of a span fall in the same year? A cross-year span must print its
 *  years — "Dec 20 – Jan 5" would hide which December and which January. */
function sameYear(dates: FeatureAdrDates): boolean {
  return dates.first.slice(0, 4) === dates.last.slice(0, 4);
}

/**
 * The visible date span (ADR D2: the binding-DECISION span, one date when the
 * ends coincide, else "first – last"). Empty string when the wire carried no span
 * or an unparseable one.
 */
export function featureDateSpanLabel(
  locale: string,
  dates: FeatureAdrDates | undefined,
  resolveMessage: LocalizedMessageResolver,
): string {
  if (dates === undefined) return "";
  const style = sameYear(dates) ? "compact" : "full";
  const first = formatTreeDate(locale, dates.first, style);
  if (first === "") return "";
  if (dates.first === dates.last) return first;
  const last = formatTreeDate(locale, dates.last, style);
  if (last === "") return "";
  return resolveMessage({
    key: "documents:tree.featureDateRange",
    values: { first, last },
  }).message;
}

/**
 * The spelled-out span for the row's accessible name and tooltip — "Decisions
 * from 14 June 2026 to 1 August 2026". The visible label is a compact glance
 * value with no stated meaning; this is where the meaning is said out loud.
 */
export function featureDateSpanAccessibleLabel(
  locale: string,
  dates: FeatureAdrDates | undefined,
  resolveMessage: LocalizedMessageResolver,
): string {
  if (dates === undefined) return "";
  const first = formatTreeDate(locale, dates.first, "full");
  if (first === "") return "";
  if (dates.first === dates.last) {
    return resolveMessage({
      key: "documents:tree.featureDecisionDate",
      values: { date: first },
    }).message;
  }
  const last = formatTreeDate(locale, dates.last, "full");
  if (last === "") return "";
  return resolveMessage({
    key: "documents:tree.featureDecisionSpan",
    values: { first, last },
  }).message;
}

/**
 * The suggestion/second-line meta for a feature: its composition and its decision
 * span, joined as one locale-correct list. Empty when the roster carries neither
 * — a feature the roster does not describe shows its name alone, never a zero
 * standing in for an unknown.
 */
export function featureMetaLine(
  locale: string,
  entry: FeatureRosterEntry | undefined,
  resolveMessage: LocalizedMessageResolver,
): string {
  if (entry === undefined) return "";
  const parts = [
    featureCompositionLabel(locale, entry.type_counts, resolveMessage),
    featureDateSpanLabel(locale, entry.adr_dates, resolveMessage),
  ].filter((part) => part !== "");
  if (parts.length === 0) return "";
  return formatList(locale, parts, { type: "unit", style: "short" }) ?? "";
}

/**
 * The feature row's full-metadata tooltip: the readable name, the plan-state
 * word, the spelled-out decision span, and the composition — the same treatment
 * a document leaf gets, because a 16rem rail cannot print any of it inline.
 */
export function featureTooltipLabel(
  locale: string,
  name: string,
  entry: FeatureRosterEntry | undefined,
  resolveMessage: LocalizedMessageResolver,
): string {
  const status = featurePlanStatus(entry?.plan_state);
  const lines = [
    name,
    status === null ? "" : resolveMessage(FEATURE_PLAN_STATUS_MESSAGES[status]).message,
    featureDateSpanAccessibleLabel(locale, entry?.adr_dates, resolveMessage),
    featureCompositionLabel(locale, entry?.type_counts, resolveMessage),
  ].filter((line) => line !== "");
  return lines.join("\n");
}
