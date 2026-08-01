// The tree browser's message vocabulary: every user-facing string the rail's rows
// and states resolve, plus the small formatters that turn a count, a ratio, or a
// served status token into a descriptor.
//
// Split out of `TreeBrowser.tsx` because it is the one part of that file with no
// React in it at all — no hooks, no elements, no props. It is a pure mapping from
// domain values to message descriptors, which is why the localization suite can
// import it directly and assert every key resolves in both LTR and RTL without
// rendering a tree. Keeping it beside the component kept ~120 lines of vocabulary
// in a file whose job is the tree itself.
//
// Presentation only, per the wire contract: a served token becomes a label and a
// tone here, and nothing in this module decides what a status IS.

import { formatPercentage } from "../../platform/localization/formatters";
import type { LocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type {
  AnyMessageDescriptor,
  MessageDescriptor,
} from "../../platform/localization/message";
import { createCountMessageDescriptor } from "../../platform/localization/message";
import { planStatus } from "./vaultRowPresentation";

export const TREE_BROWSER_MESSAGES = {
  addDocumentToFeature: {
    key: "documents:accessibility.addDocumentToFeature",
  },
  degraded: { key: "documents:tree.degraded" },
  emptyWorktree: { key: "documents:tree.emptyWorktree" },
  features: { key: "features:labels.feature" },
  loading: { key: "documents:tree.loading" },
  noFilterMatches: { key: "documents:tree.noFilterMatches" },
  noFilterMatchesYet: { key: "documents:tree.noFilterMatchesYet" },
  partialAnnouncement: { key: "documents:tree.partialAnnouncement" },
  retry: { key: "common:actions.retry" },
  treeBrowser: { key: "documents:accessibility.treeBrowser" },
  unavailable: { key: "documents:tree.unavailable" },
  vaultBrowser: { key: "documents:tree.vaultBrowser" },
  documents: { key: "documents:browserModes.documents" },
} as const satisfies Record<string, MessageDescriptor>;

export function treePartialCountMessage(count: number): AnyMessageDescriptor {
  const descriptor = createCountMessageDescriptor("documents:tree.partialCount", count);
  if (descriptor === null) return TREE_BROWSER_MESSAGES.partialAnnouncement;
  return descriptor;
}

export function treeRowActionsMessage(item: string): MessageDescriptor {
  return {
    key: "common:accessibility.actionsForItem",
    values: { item },
  };
}

export function treePlanProgressMessage(
  done: number,
  total: number,
): MessageDescriptor | null {
  if (
    !Number.isSafeInteger(done) ||
    !Number.isSafeInteger(total) ||
    done < 0 ||
    total <= 0 ||
    done > total
  ) {
    return null;
  }
  return { key: "documents:tree.planProgress", values: { done, total } };
}

export function treeWordCountMessage(count: number): AnyMessageDescriptor | null {
  return createCountMessageDescriptor("documents:tree.wordCount", count);
}

export function treeSizeSummaryMessage(
  count: number,
  size: string,
): AnyMessageDescriptor | null {
  return createCountMessageDescriptor("documents:tree.sizeSummary", count, { size });
}

export function formatTreeWeight(
  locale: string,
  weightBytes: number,
  totalBytes: number,
  resolveMessage: LocalizedMessageResolver,
): string {
  if (
    !Number.isFinite(weightBytes) ||
    !Number.isFinite(totalBytes) ||
    weightBytes <= 0 ||
    totalBytes <= 0 ||
    weightBytes > totalBytes
  ) {
    return "";
  }
  const ratio = weightBytes / totalBytes;
  if (ratio < 0.01) {
    const threshold = formatPercentage(locale, 0.01, { maximumFractionDigits: 0 });
    return threshold
      ? resolveMessage({
          key: "documents:tree.weightBelowThreshold",
          values: { threshold },
        }).message
      : "";
  }
  return formatPercentage(locale, ratio, { maximumFractionDigits: 1 }) ?? "";
}

/** Total over the served plan-status union, so a row may index it directly. */
export const PLAN_STATUS_MESSAGES = {
  complete: { key: "documents:accessibility.planComplete" },
  "in-progress": { key: "documents:accessibility.planInProgress" },
  "not-started": { key: "documents:accessibility.planNotStarted" },
} as const satisfies Record<ReturnType<typeof planStatus>, MessageDescriptor>;

const DECISION_STATUS_MESSAGES = {
  accepted: { key: "documents:accessibility.decisionAccepted" },
  deprecated: { key: "documents:accessibility.decisionDeprecated" },
  proposed: { key: "documents:accessibility.decisionProposed" },
  rejected: { key: "documents:accessibility.decisionRejected" },
  superseded: { key: "documents:accessibility.decisionSuperseded" },
} as const satisfies Record<string, MessageDescriptor>;

const DECISION_STATUS_LABEL_MESSAGES = {
  accepted: { key: "documents:tree.decisionStatusAccepted" },
  deprecated: { key: "documents:tree.decisionStatusDeprecated" },
  proposed: { key: "documents:tree.decisionStatusProposed" },
  rejected: { key: "documents:tree.decisionStatusRejected" },
  superseded: { key: "documents:tree.decisionStatusSuperseded" },
} as const satisfies Record<string, MessageDescriptor>;

export function treeDecisionStatusMessage(status: string): MessageDescriptor | null {
  return (
    DECISION_STATUS_MESSAGES[status as keyof typeof DECISION_STATUS_MESSAGES] ?? null
  );
}

export function treeDecisionStatusLabelMessage(
  status: string,
): MessageDescriptor | null {
  return (
    DECISION_STATUS_LABEL_MESSAGES[
      status as keyof typeof DECISION_STATUS_LABEL_MESSAGES
    ] ?? null
  );
}
