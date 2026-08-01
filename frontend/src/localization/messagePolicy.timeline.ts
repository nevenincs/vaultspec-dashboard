// Message-policy rows for the `timeline` namespace.
//
// Split out of `messagePolicy.ts` when that module crossed the 1500-line
// monolith gate. The rows are unchanged — this is a move, not a re-decision.
// The timeline namespace is a natural seam: its keys are authored and read as
// one surface and no other namespace's rows interleave with them.

import type { MessagePolicyEntry } from "./messagePolicy";

export const TIMELINE_MESSAGE_POLICY = {
  "timeline:accessibility.dateField": { role: "accessibility" },
  "timeline:accessibility.loadingRange": { role: "accessibility" },
  "timeline:accessibility.rangeEnd": { role: "accessibility" },
  "timeline:accessibility.rangeStart": { role: "accessibility" },
  "timeline:accessibility.selectedRange": { role: "accessibility" },
  "timeline:actions.clearDateRange": { role: "action" },
  "timeline:actions.filterByCreationDate": { role: "action" },
  "timeline:actions.filterByCreationDateCurrent": { role: "action" },
  "timeline:actions.filterByEditDate": { role: "action" },
  "timeline:actions.filterByEditDateCurrent": { role: "action" },
  "timeline:actions.filterByUpdateDate": { role: "action" },
  "timeline:actions.filterByUpdateDateCurrent": { role: "action" },
  "timeline:actions.showLast24Hours": { role: "action" },
  "timeline:actions.showLast7Days": { role: "action" },
  "timeline:actions.showLast30Days": { role: "action" },
  "timeline:actions.showLast90Days": { role: "action" },
  "timeline:actions.viewProjectAtVersion": { role: "action" },
  "timeline:criteria.created": { role: "label" },
  "timeline:criteria.modified": { role: "label" },
  "timeline:criteria.stamped": { role: "label" },
  "timeline:descriptions.useCreationDateForRange": { role: "description" },
  "timeline:descriptions.useEditDateForRange": { role: "description" },
  "timeline:descriptions.useUpdateDateForRange": { role: "description" },
  "timeline:disabledReasons.codeFiles": { role: "disabled-reason" },
  "timeline:disabledReasons.chooseProject": { role: "disabled-reason" },
  "timeline:disabledReasons.current": { role: "disabled-reason" },
  "timeline:disabledReasons.modifiedUnavailable": {
    role: "disabled-reason",
  },
  "timeline:disabledReasons.refreshHistory": { role: "disabled-reason" },
  "timeline:disabledReasons.stampedUnavailable": {
    role: "disabled-reason",
  },
  "timeline:disabledReasons.switchToDocumentsForHistory": {
    role: "disabled-reason",
  },
  "timeline:labels.timeline": { role: "label" },
  "timeline:states.noDatedDocuments": { role: "status" },
  "timeline:states.noDatedFiles": { role: "status" },
  "timeline:states.rangeUnavailable": { role: "status" },
  "timeline:summaries.selectedRange": { role: "status" },
} as const satisfies Readonly<Record<string, MessagePolicyEntry>>;
