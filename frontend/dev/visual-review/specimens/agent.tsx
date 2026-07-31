// Specimens: `agent` area (the docked Agent panel + its transcript proposal slot).
//
// `PendingChangesView` and `AgentTurnProposal` are containers over the SAME
// review-station queue `authoring.tsx` seeds for its own specimens — fixtures are
// imported from there rather than duplicated. `AgentPanel` is a deep, closed-by-
// default container: `solo` + a local wrapper fires the real `openAgentPanel()`
// store action on mount (the exact action a user click dispatches) and seeds the
// session-list/session-detail queries its transcript reads.

import { useEffect } from "react";

import { authoringKeys, type OperationMode } from "@app/stores/server/authoring";
import {
  agentKeys,
  type AgentRunRecord,
  type AgentSessionRecord,
  type PromptTurnRecord,
  type RunStatus,
  type SessionListPage,
  type SessionSnapshot,
} from "@app/stores/server/agent";
import {
  closeAgentPanel,
  openAgentPanel,
  setAgentCurrentSession,
} from "@app/stores/view/agentPanel";
import type { TiersBlock } from "@app/stores/server/engine";
import { AgentPanel } from "@app/app/agent/AgentPanel";
import { PendingChangesView } from "@app/app/agent/PendingChangesView";
import { AgentTurnProposal } from "@app/app/agent/ProposalCard";

import type { SpecimenDef } from "../registry";
import type { ReviewState } from "../state";
import {
  REVIEW_SCOPE,
  seedSessionAndDashboardState,
  tiersDown,
  tiersHealthy,
} from "./support";
import {
  AGENT_TURN_RUN_ID,
  APPLIED_ROW,
  PROPOSAL_CONFLICTED,
  PROPOSAL_ROW_1,
  PROPOSAL_ROW_2,
  PROPOSAL_WITH_RUN,
  proposalListResult,
} from "./authoring";

// --- agent-pendingchangesview -----------------------------------------------------

// (fixtures shared from ./authoring; nothing local to this section)

// --- agent-proposalcard ------------------------------------------------------------

// (fixtures shared from ./authoring; nothing local to this section)

// --- agent-agentpanel ---------------------------------------------------------------

const SESSION_ID_NORMAL = "sess-review-harness-1";
const SESSION_ID_LOADING = "sess-review-harness-loading";

function sessionRecord(
  id: string,
  title: string,
  overrides: Partial<AgentSessionRecord> = {},
): AgentSessionRecord {
  return {
    schema_version: "1",
    session_id: id,
    scope: REVIEW_SCOPE,
    title,
    status: "active",
    actor: { id: "human:reviewer-fixture", kind: "human" },
    langgraph: null,
    latest_turn_id: null,
    latest_run_id: null,
    created_at_ms: 1_753_790_000_000,
    updated_at_ms: 1_753_800_000_000,
    cancelled_at_ms: null,
    ...overrides,
  };
}

function sessionListPage(
  items: AgentSessionRecord[],
  tiers: TiersBlock = tiersHealthy("structural"),
): SessionListPage {
  return {
    items,
    cap: 20,
    truncated: false,
    next_after_ms: null,
    next_after_session_id: null,
    tiers,
  };
}

function turnRecord(
  id: string,
  sessionId: string,
  index: number,
  prompt: string,
): PromptTurnRecord {
  return {
    schema_version: "1",
    turn_id: id,
    session_id: sessionId,
    turn_index: index,
    prompt_digest: "digest",
    prompt_text: prompt,
    prompt_bytes: prompt.length,
    summary: null,
    actor: { id: "human:reviewer-fixture", kind: "human" },
    langgraph: null,
    created_at_ms: 1_753_800_000_000 + index,
  };
}

function runRecord(
  id: string,
  sessionId: string,
  turnId: string,
  status: RunStatus,
): AgentRunRecord {
  return {
    schema_version: "1",
    run_id: id,
    session_id: sessionId,
    turn_id: turnId,
    status,
    active: status === "active" || status === "cancel_requested",
    owner: { id: "agent:writer-fixture", kind: "agent" },
    langgraph: null,
    cancellation_reason: null,
    created_at_ms: 1_753_800_000_100,
    updated_at_ms: 1_753_800_030_000,
    cancelled_at_ms: null,
    completed_at_ms: status === "completed" ? 1_753_800_030_000 : null,
  };
}

/** A settled single-turn session snapshot: one prompt, one completed run — enough
 *  for `Transcript`'s fixed-order assembly (prompt → final run status) to render
 *  real content. */
function sessionSnapshot(id: string, title: string): SessionSnapshot {
  const turn = turnRecord(`${id}-t1`, id, 0, "Draft the review-harness specimens");
  const run = runRecord(`${id}-r1`, id, turn.turn_id, "completed");
  return {
    session: sessionRecord(id, title, {
      latest_turn_id: turn.turn_id,
      latest_run_id: run.run_id,
    }),
    turns: [turn],
    runs: [run],
    active_run: null,
    queued_turn_ids: [],
    caps: { turn_cap: 20, run_cap: 20 },
    tiers: tiersHealthy("structural"),
  };
}

const SESSION_LIST_PARAMS = { cap: 20 } as const;

/** Opens the docked panel on mount by firing the real `openAgentPanel()` store
 *  action (the exact action the footer chip dispatches) and binds the authored
 *  current session; resets the (module-singleton) view store on unmount so a
 *  state switch never leaks an open panel into the next specimen visited. Sized
 *  via a local host div — `AgentPanel` normally sizes off its shell-owned grid
 *  track (`col-start-4`), which does not exist standalone here. */
function AgentPanelSpecimen({ state }: { state: ReviewState }) {
  const currentSessionId =
    state === "empty" || state === "degraded" ? null : SESSION_ID_NORMAL;
  useEffect(() => {
    openAgentPanel({ view: "transcript" });
    setAgentCurrentSession(currentSessionId);
    return () => {
      closeAgentPanel();
      setAgentCurrentSession(null);
    };
  }, [currentSessionId]);
  return (
    <AgentPanel className="relative flex h-full w-full min-h-0 min-w-0 flex-col border-l border-rule bg-paper" />
  );
}

// --- registry ------------------------------------------------------------------------

export const agentSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "agent-pendingchangesview": {
    note: "Container: re-hosts the shared ReviewStationBody over live useReviewStationView()/useReviewActions() store hooks — the SAME review-station queue authoring.tsx seeds, fixtures imported from there. Seeds authoringKeys.proposals() (+ operationMode, the pre-proposal mode fallback) at the real query key; loading leaves it unseeded so useProposals() pends and the body's own Skeleton renders. 'degraded' seeds a tiers-down proposals payload (informationMayBeOutOfDate) — the only degraded path this read supports; the alternate storeUnavailable branch needs a genuine typed 503 error, which the desk never fakes.",
    seed: (client, state) => {
      if (state === "loading") return;
      if (state === "normal") {
        client.setQueryData(
          authoringKeys.proposals(),
          proposalListResult([PROPOSAL_ROW_1, PROPOSAL_ROW_2], {
            afterFact: [APPLIED_ROW],
          }),
        );
        client.setQueryData(
          authoringKeys.operationMode(),
          "manual" satisfies OperationMode,
        );
        return;
      }
      if (state === "empty") {
        client.setQueryData(authoringKeys.proposals(), proposalListResult([]));
        client.setQueryData(
          authoringKeys.operationMode(),
          "manual" satisfies OperationMode,
        );
        return;
      }
      client.setQueryData(
        authoringKeys.proposals(),
        proposalListResult([PROPOSAL_ROW_1], {
          tiers: tiersDown(["structural"]),
          truncated: true,
        }),
      );
    },
    render: () => <PendingChangesView />,
  },

  "agent-proposalcard": {
    note: "Container: AgentTurnProposal reads useReviewStationView() and correlates its rows against `runId` by the served run_id (correlateProposalByRun) — the SAME queue read agent-pendingchangesview seeds, at the identical key, fixtures shared from authoring.tsx. It renders the shared ProposalCard on a match and null otherwise, an honest empty slot the transcript relies on. Neither loading nor degraded has a bespoke rendering of its own here: 'loading' leaves the key unseeded so the slot stays honestly blank until the queue resolves — visually identical to 'empty' (an unmatched runId), noted rather than hidden; 'degraded' authors a served conflict on the matched proposal (ProposalCard's own inline conflict banner) as the closest honest per-row degraded analog, since this read carries no tiers-driven branch of its own.",
    seed: (client, state) => {
      if (state === "loading") return;
      if (state === "degraded") {
        client.setQueryData(
          authoringKeys.proposals(),
          proposalListResult([PROPOSAL_CONFLICTED]),
        );
        return;
      }
      // "empty" seeds the SAME matching row — the empty rendering comes from the
      // runId prop below carrying no match, not from an empty queue.
      client.setQueryData(
        authoringKeys.proposals(),
        proposalListResult([PROPOSAL_WITH_RUN]),
      );
    },
    render: (state) => (
      <AgentTurnProposal
        runId={state === "empty" ? "run-unmatched" : AGENT_TURN_RUN_ID}
      />
    ),
  },

  "agent-agentpanel": {
    solo: true,
    host: "h-[32rem] w-[26rem] relative",
    note: "Closed-by-default deep container: a local wrapper opens it via the real openAgentPanel() store action on mount (the exact action the footer chip dispatches) and binds an authored current session. Seeds session+dashboardState (useActiveScope), agentKeys.sessionList({cap:20}) (header + empty/degraded branching), and agentKeys.session(id) (the transcript). 'loading' seeds the session list but leaves the session detail unseeded, so useSession's own Skeleton renders. 'empty' has no current session and a healthy empty list -> the 'no session yet' StateBlock. 'degraded' has no current session and a tiers-down list -> useAgentSessionsDegraded's 'unavailable' StateBlock. The composer, autonomy control, and team-run recovery mount unconditionally alongside (unseeded reads there stay honestly pending; they carry no visible loading affordance of their own outside a live run).",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      if (state === "loading") {
        client.setQueryData(
          agentKeys.sessionList(SESSION_LIST_PARAMS),
          sessionListPage([
            sessionRecord(SESSION_ID_NORMAL, "Review harness walkthrough"),
          ]),
        );
        return;
      }
      if (state === "empty") {
        client.setQueryData(
          agentKeys.sessionList(SESSION_LIST_PARAMS),
          sessionListPage([]),
        );
        return;
      }
      if (state === "degraded") {
        client.setQueryData(
          agentKeys.sessionList(SESSION_LIST_PARAMS),
          sessionListPage([], tiersDown(["structural"])),
        );
        return;
      }
      client.setQueryData(
        agentKeys.sessionList(SESSION_LIST_PARAMS),
        sessionListPage([
          sessionRecord(SESSION_ID_NORMAL, "Review harness walkthrough"),
          sessionRecord(SESSION_ID_LOADING, "Author the DiffPanel specimen"),
        ]),
      );
      client.setQueryData(
        agentKeys.session(SESSION_ID_NORMAL),
        sessionSnapshot(SESSION_ID_NORMAL, "Review harness walkthrough"),
      );
      client.setQueryData(authoringKeys.proposals(), proposalListResult([]));
      client.setQueryData(
        authoringKeys.operationMode(),
        "manual" satisfies OperationMode,
      );
    },
    render: (state) => <AgentPanelSpecimen state={state} />,
  },
};
