// What a vault tree row SHOWS: its one item icon, its trailing signal, its meta
// value, and its tooltip — for both row kinds the tree renders, the document leaf
// and the feature folder.
//
// Split out of `TreeBrowser.tsx` alongside `treeBrowserMessages.ts`: that module
// maps domain values to message descriptors, this one maps them to the small
// presentational pieces a row slots in. Neither holds hooks, props, or state —
// `TreeBrowser.tsx` keeps the tree itself (the row shell, the expansion, the focus
// zone, the reveal reactions), which is the part that is actually a component.
//
// Presentation only, per the wire contract. Every status, progress pair, count,
// and date here is SERVED; nothing in this module decides what a state is, and a
// value the wire did not carry renders as nothing rather than as a floor.

import type { ReactNode } from "react";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

import { formatBytes } from "../../platform/localization/formatters";
import type { LocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { FeatureRosterEntry, VaultTreeEntry } from "../../stores/server/engine";
import type { RailSortKey } from "../../stores/view/railSort";
import {
  FEATURE_PLAN_STATUS_MESSAGES,
  featureDateSpanAccessibleLabel,
  featureDateSpanLabel,
  featurePlanStatus,
} from "./featureRowPresentation";
import {
  PLAN_STATUS_MESSAGES,
  treeDecisionStatusLabelMessage,
  treeDecisionStatusMessage,
  treePlanProgressMessage,
  treeSizeSummaryMessage,
  treeWordCountMessage,
} from "./treeBrowserMessages";
import {
  adrStatusMark,
  adrStatusToneClass,
  formatTreeDate,
  planStatus,
  planStatusMark,
  planStatusToneClass,
  planTierLabel,
} from "./vaultRowPresentation";

/** The presentation of a row's SERVED state as its item icon: the shape, its
 *  sanctioned tone class, and the plain-language word that becomes the icon's
 *  accessible name (the rail is too narrow for the word itself). `statusHook`
 *  carries the row-level `data-*-status` attribute where the icon is the only
 *  status carrier; on compact the inline status WORD carries it instead, so the
 *  hook resolves to the element that actually presents the token. Nothing here
 *  decides what the status IS — the projection serves it. */
export interface RowStatusMark {
  Mark: PhosphorIcon;
  toneClass: string;
  label: string;
  statusHook?: {
    attribute: "data-adr-status" | "data-plan-status" | "data-feature-plan-status";
    value: string;
  };
}

// --- the document leaf ------------------------------------------------------------

/** A leaf's SERVED review state as the row's one item icon: a plan's progress ring,
 *  a decision's acceptance shape. Undefined for a doc type with no served review
 *  state — those rows keep the doc-type glyph. `carriesStatusHook` is false on
 *  compact, where the inline status WORD carries the `data-*-status` attribute. */
export function docStatusMark(
  entry: VaultTreeEntry,
  resolveMessage: LocalizedMessageResolver,
  carriesStatusHook: boolean,
): RowStatusMark | undefined {
  if (entry.doc_type === "plan") {
    const status = planStatus(entry.progress);
    return {
      Mark: planStatusMark(status),
      toneClass: planStatusToneClass(status),
      label: resolveMessage(PLAN_STATUS_MESSAGES[status]).message,
      ...(carriesStatusHook
        ? { statusHook: { attribute: "data-plan-status" as const, value: status } }
        : {}),
    };
  }
  if (entry.doc_type === "adr" && entry.status) {
    const Mark = adrStatusMark(entry.status);
    const statusMessage = treeDecisionStatusMessage(entry.status);
    if (!Mark || !statusMessage) return undefined;
    return {
      Mark,
      toneClass: adrStatusToneClass(entry.status),
      label: resolveMessage(statusMessage).message,
      ...(carriesStatusHook
        ? {
            statusHook: { attribute: "data-adr-status" as const, value: entry.status },
          }
        : {}),
    };
  }
  return undefined;
}

/** The trailing review-state VALUE — a plan's done-of-total count. The state's SHAPE
 *  now leads the row as its item icon, so nothing here repeats it. */
export function docSignal(
  entry: VaultTreeEntry,
  resolveMessage: LocalizedMessageResolver,
): ReactNode {
  if (entry.doc_type !== "plan" || !entry.progress) return null;
  const progressMessage = treePlanProgressMessage(
    entry.progress.done,
    entry.progress.total,
  );
  if (!progressMessage) return null;
  return (
    <span
      className={`shrink-0 text-meta font-normal ${planStatusToneClass(planStatus(entry.progress))}`}
      data-tabular
    >
      {resolveMessage(progressMessage).message}
    </span>
  );
}

export function docCompactSubMeta(
  entry: VaultTreeEntry,
  resolveMessage: LocalizedMessageResolver,
  locale: string,
): ReactNode | undefined {
  const date = formatTreeDate(
    locale,
    entry.dates.created ?? entry.dates.modified,
    "compact",
  );
  const pillClass = "shrink-0 rounded-fg-xs bg-paper-sunken px-fg-1";
  let status: ReactNode = null;
  if (entry.doc_type === "adr" && entry.status) {
    const statusMessage = treeDecisionStatusLabelMessage(entry.status);
    if (statusMessage && adrStatusMark(entry.status)) {
      status = (
        <span
          className={`${pillClass} ${adrStatusToneClass(entry.status)}`}
          data-adr-status={entry.status}
        >
          {resolveMessage(statusMessage).message}
        </span>
      );
    }
  } else if (entry.doc_type === "plan") {
    const planState = planStatus(entry.progress);
    const progressMessage = entry.progress
      ? treePlanProgressMessage(entry.progress.done, entry.progress.total)
      : null;
    const label = entry.progress
      ? progressMessage
        ? resolveMessage(progressMessage).message
        : null
      : resolveMessage(PLAN_STATUS_MESSAGES[planState]).message;
    if (!label) return date ? <span>{date}</span> : undefined;
    status = (
      <span
        className={`${pillClass} ${planStatusToneClass(planState)}`}
        data-plan-status={planState}
      >
        {label}
      </span>
    );
  }
  if (!date && !status) return undefined;
  return (
    <>
      {date && (
        <span className="shrink-0 text-ink-muted" data-doc-date>
          {date}
        </span>
      )}
      {status}
    </>
  );
}

export function docMetaLabel(
  entry: VaultTreeEntry,
  sortKey: RailSortKey,
  resolveMessage: LocalizedMessageResolver,
  locale: string,
): string {
  if (sortKey === "size" && entry.size) {
    const message = treeWordCountMessage(entry.size.words);
    return message ? resolveMessage(message).message : "";
  }
  if (sortKey === "weight" && entry.size) {
    return formatBytes(locale, entry.size.bytes) ?? "";
  }
  if (
    (sortKey === "recency" || sortKey === "docs" || sortKey === "name") &&
    entry.doc_type === "plan" &&
    entry.progress
  ) {
    return "";
  }
  const date =
    sortKey === "modified"
      ? (entry.dates.modified ?? entry.dates.created)
      : (entry.dates.created ?? entry.dates.modified);
  return formatTreeDate(locale, date, "compact");
}

export function docTooltipLabel(
  entry: VaultTreeEntry,
  resolveMessage: LocalizedMessageResolver,
  locale: string,
): string {
  const lines = [entry.path];
  const dateMessages = [
    ["documents:tree.created", entry.dates.created],
    ["documents:tree.updated", entry.dates.stamped],
    ["documents:tree.lastEdited", entry.dates.modified],
  ] as const;
  for (const [key, rawDate] of dateMessages) {
    const date = formatTreeDate(locale, rawDate, "full");
    if (date) lines.push(resolveMessage({ key, values: { date } }).message);
  }
  if (entry.size) {
    const size = formatBytes(locale, entry.size.bytes);
    if (size) {
      const message = treeSizeSummaryMessage(entry.size.words, size);
      if (message) lines.push(resolveMessage(message).message);
    }
  }
  const tier = entry.tier ? planTierLabel(entry.tier) : "";
  if (tier) lines.push(tier);
  return lines.join("\n");
}

// --- the feature folder -----------------------------------------------------------

/** The feature row's ONE item icon: its SERVED plan-state rollup, drawn with the
 *  SAME sanctioned marks a plan leaf uses (finished reads the acceptance check,
 *  in-progress the half ring, not-started the empty ring). Undefined when the
 *  feature carries no readable plan state, and the row keeps the plain feature
 *  glyph — an unknown status is never drawn as a not-started one. */
export function featureStatusMark(
  entry: FeatureRosterEntry | undefined,
  resolveMessage: LocalizedMessageResolver,
): RowStatusMark | undefined {
  const status = featurePlanStatus(entry?.plan_state);
  if (status === null) return undefined;
  return {
    Mark: planStatusMark(status),
    toneClass: planStatusToneClass(status),
    label: resolveMessage(FEATURE_PLAN_STATUS_MESSAGES[status]).message,
    statusHook: { attribute: "data-feature-plan-status", value: status },
  };
}

/** The feature row's trailing date: the compact binding-decision span at a glance,
 *  named for assistive tech with the sentence that says what the span MEANS (a
 *  bare date pair on a feature row states nothing about which dates they are). */
export function featureDateSignal(
  locale: string,
  entry: FeatureRosterEntry | undefined,
  resolveMessage: LocalizedMessageResolver,
): ReactNode {
  const span = featureDateSpanLabel(locale, entry?.adr_dates, resolveMessage);
  if (span === "") return undefined;
  const accessibleLabel = featureDateSpanAccessibleLabel(
    locale,
    entry?.adr_dates,
    resolveMessage,
  );
  const className = "shrink-0 text-meta font-normal text-ink-muted";
  // `role="img"` replaces the compact date text with the sentence that says what
  // the dates MEAN — which is only an improvement while that sentence exists. An
  // unlabelled img would announce nothing, so an empty label falls back to a
  // plain span that reads its own text.
  if (accessibleLabel === "") {
    return (
      <span className={className} data-feature-dates data-tabular>
        {span}
      </span>
    );
  }
  return (
    <span
      className={className}
      data-feature-dates
      data-tabular
      role="img"
      aria-label={accessibleLabel}
    >
      {span}
    </span>
  );
}
