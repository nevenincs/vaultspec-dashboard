// The pending-changes signpost + disclosure toggle (D9). Pinned composer-adjacent,
// it signposts pending changes the conversation cannot show inline: proposals NOT
// correlated to the current session's runs (other sessions, expired sessions,
// human/non-agent changesets) plus after-the-fact applied work not yet
// acknowledged. Clicking it expands/collapses the in-flow "changes awaiting
// review" region ABOVE the composer — a disclosure inside the one conversation
// view, never a view switch; the composer never unmounts. It renders nothing when
// the queue is empty AND the region is closed (no standing chrome), but stays
// rendered while the region is open so the region can always be collapsed.
//
// Layer ownership: a DUMB app-chrome view over the SAME store hooks the region uses
// (no new fetch, no new model). The count derivation is a PURE function
// (`derivePendingChangesBridge`) so it is unit-tested directly.

import { useMemo } from "react";
import { ChevronDown, ChevronRight, Inbox } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { useReviewStationView } from "../../stores/server/authoring";
import type {
  AppliedUnderPolicyProjection,
  ProposalProjection,
} from "../../stores/server/authoring";
import { useSession } from "../../stores/server/agent";
import {
  setAgentPendingChangesOpen,
  useAgentCurrentSessionId,
  useAgentPendingChangesOpen,
} from "../../stores/view/agentPanel";

const BRIDGE = {
  count: "common:agent.pendingBridge.count",
  more: "common:agent.pendingBridge.more",
  regionName: "common:agent.pending.label",
} as const;

export interface PendingChangesBridgeInput {
  /** The served proposal queue rows. */
  rows: readonly ProposalProjection[];
  /** The served applied-under-policy (after-the-fact) rows. */
  afterFactRows: readonly AppliedUnderPolicyProjection[];
  /** The proposal queue holds more rows than the served page cap. */
  truncated: boolean;
  /** The after-the-fact lane holds more rows than the served page cap. */
  afterFactTruncated: boolean;
  /** The run ids of the CURRENT conversation's session — a proposal bound to one of
   *  these is shown inline in the transcript, so it is NOT counted here. */
  currentSessionRunIds: ReadonlySet<string>;
}

export interface PendingChangesBridgeView {
  /** Whether the affordance renders at all (false when nothing is out-of-session). */
  present: boolean;
  /** The exact out-of-session count, or `null` when the served projection is
   *  truncated — the honest count-less state (wire-contract: never re-count a capped
   *  slice as a total). */
  count: number | null;
}

/**
 * Derive the bridge affordance from the served queue and the current session's runs.
 * Out-of-session = a proposal whose served `run_id` is NOT one of the current
 * conversation's runs (a proposal with no `run_id` is a non-agent changeset, also
 * out-of-conversation). After-the-fact rows count only while unacknowledged. When
 * either served list is truncated, the count degrades to `null` (count-less).
 */
export function derivePendingChangesBridge(
  input: PendingChangesBridgeInput,
): PendingChangesBridgeView {
  const outOfSession = input.rows.filter(
    (row) => row.run_id === undefined || !input.currentSessionRunIds.has(row.run_id),
  );
  const unacknowledgedAfterFact = input.afterFactRows.filter(
    (row) => row.acknowledgement_count === 0,
  );
  const served = outOfSession.length + unacknowledgedAfterFact.length;
  if (served === 0) return { present: false, count: 0 };
  const truncated = input.truncated || input.afterFactTruncated;
  return { present: true, count: truncated ? null : served };
}

export function PendingChangesBridge() {
  const resolveMessage = useLocalizedMessageResolver();
  const view = useReviewStationView();
  const currentSessionId = useAgentCurrentSessionId();
  const session = useSession(currentSessionId);

  const sessionData = session.data;
  const currentSessionRunIds = useMemo(
    () => new Set((sessionData?.runs ?? []).map((run) => run.run_id)),
    [sessionData],
  );

  const bridge = useMemo(
    () =>
      derivePendingChangesBridge({
        rows: view.rows,
        afterFactRows: view.afterFactRows,
        truncated: view.truncated,
        afterFactTruncated: view.afterFactTruncated,
        currentSessionRunIds,
      }),
    [
      view.rows,
      view.afterFactRows,
      view.truncated,
      view.afterFactTruncated,
      currentSessionRunIds,
    ],
  );

  const open = useAgentPendingChangesOpen();

  // No standing chrome: nothing out-of-session and the region closed → nothing.
  // While the region is OPEN the strip stays (it is the collapse affordance),
  // labelled by the plain region name when there is no count to signpost.
  if (!bridge.present && !open) return null;

  const label = bridge.present
    ? bridge.count === null
      ? resolveMessage({ key: BRIDGE.more }).message
      : resolveMessage({ key: BRIDGE.count, values: { count: bridge.count } }).message
    : resolveMessage({ key: BRIDGE.regionName }).message;

  return (
    <button
      type="button"
      data-pending-changes-bridge
      aria-expanded={open}
      onClick={() => setAgentPendingChangesOpen(!open)}
      className="flex w-full items-center gap-fg-2 border-t border-rule px-fg-2 py-fg-1-5 text-left text-meta text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <Inbox size={16} aria-hidden className="shrink-0 text-ink-faint" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {open ? (
        <ChevronDown size={14} aria-hidden className="shrink-0 text-ink-faint" />
      ) : (
        <ChevronRight size={14} aria-hidden className="shrink-0 text-ink-faint" />
      )}
    </button>
  );
}
