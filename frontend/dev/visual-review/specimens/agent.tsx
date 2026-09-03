// Specimens: `agent` area — the docked Agent panel AND the surfaces it is made of.
//
// The panel is not one surface: the conversation law (agent-panel-shell-integration
// D4, clauses C1-C8) is carried by the transcript, the work-stretch disclosure it
// groups, the clarification card that parks a run, the team-run transcript, the
// composer, and the collapsed chip. Each is reviewed on its own here, because a
// reviewer judging "does a parked run read correctly" cannot get at that state by
// opening the outer panel and hoping the fixtures line up.
//
// `PendingChangesView` and `AgentTurnProposal` are containers over the SAME
// review-station queue `authoring.tsx` seeds for its own specimens — fixtures are
// imported from there rather than duplicated. `AgentPanel` is a deep, closed-by-
// default container: `solo` + a local wrapper fires the real `openAgentPanel()`
// store action on mount (the exact action a user click dispatches) and seeds the
// session-list/session-detail queries its transcript reads.

import { useEffect, type ReactNode } from "react";

import { authoringKeys, type OperationMode } from "@app/stores/server/authoring";
import type {
  RelayFrameKind,
  RelayTranscriptFrame,
} from "@app/stores/server/liveAdapters/a2aRelay";
import type { PendingClarification } from "@app/app/agent/clarification";
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
import {
  a2aKeys,
  type RunProgress,
  type TeamPreset,
} from "@app/stores/server/agent/a2aTeam";
import { setAgentTeamRun } from "@app/stores/view/agentPanel";
import {
  clearAgentTranscriptAnnex,
  recordAgentThinking,
  recordAgentToolCall,
} from "@app/stores/view/agentTranscript";
import { AgentPanel } from "@app/app/agent/AgentPanel";
import { AgentBeginView } from "@app/app/agent/AgentBeginView";
import { AGENT_BEGIN_RECENTS_CAP } from "@app/app/agent/agentBegin";
import { AgentChip } from "@app/app/agent/AgentChip";
import { ClarificationCard } from "@app/app/agent/ClarificationCard";
import { Composer } from "@app/app/agent/Composer";
import { PendingChangesBridge } from "@app/app/agent/PendingChangesBridge";
import { PendingChangesView } from "@app/app/agent/PendingChangesView";
import { AgentTurnProposal } from "@app/app/agent/ProposalCard";
import { TeamRunProgressContext } from "@app/app/agent/TeamRunProgressContext";
import { TeamRunTranscript } from "@app/app/agent/TeamRunTranscript";
import { Transcript } from "@app/app/agent/Transcript";

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
  summary: string | null = null,
): PromptTurnRecord {
  return {
    schema_version: "1",
    turn_id: id,
    session_id: sessionId,
    turn_index: index,
    prompt_digest: "digest",
    prompt_text: prompt,
    prompt_bytes: prompt.length,
    summary,
    actor: { id: "human:reviewer-fixture", kind: "human" },
    langgraph: null,
    created_at_ms: 1_753_800_000_000 + index,
  };
}

/** Seed the CLIENT-HELD transcript annex (`stores/view/agentTranscript`) for the
 *  single-agent cells: recorded tool calls and a reasoning segment, shaped
 *  exactly as the store holds them when the client dispatches real execute
 *  envelopes. Without this the work-stretch disclosure — most of what the
 *  transcript IS — never renders on the desk, because no single-agent wire
 *  surface serves this content (it is annex-only by the honesty contract).
 *  Authored inputs only; no wire is faked. */
function seedTranscriptAnnex(sessionId: string): void {
  clearAgentTranscriptAnnex();
  recordAgentThinking({
    runId: `${sessionId}-r1`,
    text: "Weighing which review-harness cells still need authored states, and which states the components genuinely carry.",
    durationMs: 4_200,
  });
  recordAgentToolCall({
    toolCallId: "call-annex-1",
    runId: `${sessionId}-r1`,
    tool: "search_corpus",
    disposition: "dispatched",
    interruptId: null,
    permission: null,
    input: { query: "review harness specimen states" },
    result: { matches: 3 },
    detail: null,
    recordedAtMs: 1_753_800_005_000,
  });
  recordAgentToolCall({
    toolCallId: "call-annex-2",
    runId: `${sessionId}-r1`,
    tool: "edit_document",
    disposition: "dispatched",
    interruptId: null,
    permission: "granted",
    input: { section: "Findings" },
    result: { ok: true },
    detail: "Review harness plan",
    recordedAtMs: 1_753_800_010_000,
  });
  // The LIVE second run: one tool call still in flight, so the loading cell's
  // stretch reads as working rather than settled.
  recordAgentToolCall({
    toolCallId: "call-annex-3",
    runId: `${sessionId}-r2`,
    tool: "edit_document",
    disposition: "dispatched",
    interruptId: null,
    permission: null,
    input: { section: "Clarification" },
    result: null,
    detail: null,
    recordedAtMs: 1_753_800_020_000,
  });
}

/** Mount-scoped annex seeding for a specimen cell (cleared on unmount so no
 *  other cell inherits it). */
function WithTranscriptAnnex({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    seedTranscriptAnnex(sessionId);
    return () => clearAgentTranscriptAnnex();
  }, [sessionId]);
  return <>{children}</>;
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
  const turn = turnRecord(
    `${id}-t1`,
    id,
    0,
    "Draft the review-harness specimens",
    "Drafted the two specimen cells and wired their authored states; the degraded branch still needs a fixture.",
  );
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
 *  via a local host div — `AgentPanel` normally fills the center dock's reserved
 *  `__agent__` panel, whose geometry does not exist standalone here. */
function AgentPanelSpecimen({ state }: { state: ReviewState }) {
  const currentSessionId =
    state === "empty" || state === "degraded" ? null : SESSION_ID_NORMAL;
  useEffect(() => {
    openAgentPanel();
    setAgentCurrentSession(currentSessionId);
    return () => {
      closeAgentPanel();
      setAgentCurrentSession(null);
    };
  }, [currentSessionId]);
  return (
    <div className="relative h-full w-full min-h-0 min-w-0 border-l border-rule">
      <WithTranscriptAnnex sessionId={SESSION_ID_NORMAL}>
        <AgentPanel />
      </WithTranscriptAnnex>
    </div>
  );
}

// --- agent-transcript / agent-composer / agent-agentchip -----------------------------

/** A multi-turn snapshot: two user prompts, the first answered, the second still
 *  running — the C1 speaker-cue pair (bubble vs open) with a live run under it. */
function conversationSnapshot(): SessionSnapshot {
  const id = SESSION_ID_NORMAL;
  const first = turnRecord(
    `${id}-t1`,
    id,
    0,
    "Draft the review-harness specimens",
    "Drafted the two specimen cells and wired their authored states; the degraded branch still needs a fixture.",
  );
  const second = turnRecord(
    `${id}-t2`,
    id,
    1,
    "Now cover the parked-clarification case as well",
  );
  const done = runRecord(`${id}-r1`, id, first.turn_id, "completed");
  const live = runRecord(`${id}-r2`, id, second.turn_id, "active");
  return {
    session: sessionRecord(id, "Review harness walkthrough", {
      latest_turn_id: second.turn_id,
      latest_run_id: live.run_id,
    }),
    turns: [first, second],
    runs: [done, live],
    active_run: live,
    queued_turn_ids: [],
    caps: { turn_cap: 20, run_cap: 20 },
    tiers: tiersHealthy("structural"),
  };
}

/** An empty-but-real session: created, never prompted. */
function emptySnapshot(): SessionSnapshot {
  return {
    session: sessionRecord(SESSION_ID_NORMAL, "Untitled session"),
    turns: [],
    runs: [],
    active_run: null,
    queued_turn_ids: [],
    caps: { turn_cap: 20, run_cap: 20 },
    tiers: tiersHealthy("structural"),
  };
}

function teamPreset(id: string, displayName: string): TeamPreset {
  return {
    id,
    loadable: true,
    display_name: displayName,
    description: "Authored preset for the review desk.",
    topology: "supervisor",
    worker_count: 3,
    required_roles: ["writer", "reviewer"],
    is_mock: false,
  };
}

const TEAM_PRESETS = {
  presets: [
    teamPreset("authoring", "Authoring team"),
    teamPreset("audit", "Audit team"),
  ],
  tiers: tiersHealthy("agent"),
};

/** Binds the authored current session for the duration of one cell, then clears it
 *  — the panel view store is a module singleton shared by every cell on the page. */
function WithCurrentSession({
  sessionId,
  children,
}: {
  sessionId: string | null;
  children: ReactNode;
}) {
  useEffect(() => {
    setAgentCurrentSession(sessionId);
    return () => setAgentCurrentSession(null);
  }, [sessionId]);
  return <>{children}</>;
}

// --- agent-clarificationcard ---------------------------------------------------------

/** The D5 questionnaire payload: one required `text`, one `choice` with options —
 *  both branches the card renders, in one card, so the desk shows the whole shape. */
const PENDING_CLARIFICATION: PendingClarification = {
  requestId: "clarify-review-harness-1",
  questions: [
    {
      id: "q-scope",
      prompt: "Which scope should the migration cover?",
      kind: "choice",
      options: [
        { id: "workspace", label: "This workspace only" },
        { id: "all", label: "Every attached workspace" },
      ],
      required: true,
    },
    {
      id: "q-note",
      prompt: "Anything the team should know before it starts?",
      kind: "text",
      options: [],
      required: false,
    },
  ],
};

// --- agent-teamruntranscript ---------------------------------------------------------

const TEAM_RUN_ID = "team-run-review-harness";
const TEAM_RUN_PROMPT = "Migrate the rail rows onto the shared row primitive";

function frame(
  kind: RelayFrameKind,
  event: string,
  payload: Record<string, unknown>,
  seq: number,
): RelayTranscriptFrame {
  return { seq, kind, event, payload };
}

/** A run mid-flight: the supervisor reasons, a worker runs one tool, and one agent
 *  has streamed a visible answer — the three entry kinds `assembleTeamRun` groups. */
const TEAM_FRAMES: RelayTranscriptFrame[] = [
  frame(
    "status",
    "team_status",
    {
      agents: [
        { agent_id: "supervisor", state: "working" },
        { agent_id: "writer", state: "working" },
      ],
    },
    1,
  ),
  frame(
    "thought",
    "thought_chunk",
    {
      agent_id: "supervisor",
      message_id: "th-1",
      content:
        "The rail rows already share a presentation module, so the migration is ",
    },
    2,
  ),
  frame(
    "thought",
    "thought_chunk",
    {
      agent_id: "supervisor",
      message_id: "th-1",
      content: "an adoption, not a rewrite.",
    },
    3,
  ),
  frame(
    "tool_call",
    "tool_call_start",
    {
      agent_id: "writer",
      tool_call_id: "tc-1",
      title: "Read treeRowChrome.tsx",
      status: "running",
    },
    4,
  ),
  frame(
    "tool_call",
    "tool_call_update",
    {
      agent_id: "writer",
      tool_call_id: "tc-1",
      title: "Read treeRowChrome.tsx",
      status: "completed",
      content: [{ content_type: "text", text: "283 lines read." }],
    },
    5,
  ),
  frame(
    "token",
    "message_chunk",
    {
      agent_id: "writer",
      message_id: "m-1",
      content:
        "Three rows adopt the primitive; the filter field keeps its own second line.",
    },
    6,
  ),
];

function teamProgress(state: ReviewState): RunProgress {
  if (state === "loading")
    return { frames: TEAM_FRAMES.slice(0, 2), degraded: false, terminal: false };
  if (state === "empty") return { frames: [], degraded: false, terminal: false };
  if (state === "degraded") {
    return {
      frames: [
        ...TEAM_FRAMES,
        frame("degraded", "status", { degraded: true, status: "running" }, 7),
      ],
      degraded: true,
      terminal: false,
    };
  }
  return { frames: TEAM_FRAMES, degraded: false, terminal: true };
}

/** Binds the panel store's team-run slot for one cell (the transcript renders
 *  nothing without a bound run) and supplies the authored progress through the
 *  context the production provider fills from the relay. */
function TeamRunSpecimen({ state }: { state: ReviewState }) {
  useEffect(() => {
    setAgentTeamRun({
      runId: TEAM_RUN_ID,
      prompt: TEAM_RUN_PROMPT,
      scope: REVIEW_SCOPE,
    });
    return () => setAgentTeamRun(null);
  }, []);
  return (
    <TeamRunProgressContext.Provider value={teamProgress(state)}>
      <TeamRunTranscript />
    </TeamRunProgressContext.Provider>
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

  "agent-transcript": {
    host: "h-[30rem] w-[26rem] overflow-y-auto",
    note: "Transcript takes the durable SessionSnapshot as a prop, plus the CLIENT-HELD annex (stores/view/agentTranscript) seeded with authored tool calls and a reasoning segment — the single-agent wire serves neither, so without the annex the work-stretch disclosure (most of the transcript's grammar) never renders. It shows the ONE kit's C1 speaker cue (right-aligned user bubble vs full-width open answer) and the C2/C3 work-stretch disclosure grouping reasoning and tool steps one level deep. Normal is a two-turn conversation whose second run is still active; loading is that same conversation with the active run mid-flight; empty is a real session created but never prompted (the honest empty state); degraded serves the snapshot with the structural tier down, the only degraded branch this read carries.",
    render: (state) => {
      if (state === "empty") return <Transcript snapshot={emptySnapshot()} />;
      const snapshot = conversationSnapshot();
      if (state === "degraded") {
        return (
          <WithTranscriptAnnex sessionId={SESSION_ID_NORMAL}>
            <Transcript snapshot={{ ...snapshot, tiers: tiersDown(["structural"]) }} />
          </WithTranscriptAnnex>
        );
      }
      if (state === "loading") {
        return (
          <WithTranscriptAnnex sessionId={SESSION_ID_NORMAL}>
            <Transcript snapshot={{ ...snapshot, turns: snapshot.turns.slice(0, 1) }} />
          </WithTranscriptAnnex>
        );
      }
      return (
        <WithTranscriptAnnex sessionId={SESSION_ID_NORMAL}>
          <Transcript snapshot={snapshot} />
        </WithTranscriptAnnex>
      );
    },
  },

  "agent-composer": {
    host: "h-[18rem] w-[26rem]",
    note: "Container: the composer reads the current session, the served team presets, and the panel team-run slot. Seeds session + dashboard state (useActiveScope) and a2aKeys.presets() so the Team selector resolves engine-free. Normal binds a settled session — the resting ONE-CARD composer (D11): no send button (Enter sends; the input carries the accessible hint); loading binds the session whose latest run is still ACTIVE, the real busy posture — the square Stop occupies the run slot (C6); empty binds NO session, the first-prompt composer a user meets before a session exists; degraded seeds a tiers-down presets payload, the served verdict the Team selector disables itself from and states as its reason.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      if (state === "degraded") {
        client.setQueryData(a2aKeys.presets(), {
          presets: [],
          tiers: tiersDown(["agent"]),
        });
        return;
      }
      client.setQueryData(a2aKeys.presets(), TEAM_PRESETS);
      if (state === "empty") return;
      // The composer's busy posture is a RUN in flight (Stop run replaces Send),
      // not an unresolved query — so `loading` binds the session whose latest run
      // is still active and `normal` binds the settled one.
      client.setQueryData(
        agentKeys.session(SESSION_ID_NORMAL),
        state === "loading"
          ? conversationSnapshot()
          : sessionSnapshot(SESSION_ID_NORMAL, "Review harness walkthrough"),
      );
    },
    render: (state) => (
      <WithCurrentSession sessionId={state === "empty" ? null : SESSION_ID_NORMAL}>
        <Composer />
      </WithCurrentSession>
    ),
  },

  "agent-agentbeginview": {
    host: "h-[26rem] w-[26rem]",
    note: "Container: the panel pre-session view. Reads the served team availability (the SAME state the Team selector disables from, so headline and selector can never disagree) and the recent-session list. Normal seeds recents plus available presets; loading leaves both keys unseeded, the unsettled posture the view holds without claiming the plane is down; empty seeds a healthy but empty recents list; degraded seeds a tiers-down presets payload, which drives the shared degraded StateBlock the view renders instead of its headline.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      if (state === "loading") return;
      if (state === "degraded") {
        client.setQueryData(a2aKeys.presets(), {
          presets: [],
          tiers: tiersDown(["agent"]),
        });
        return;
      }
      client.setQueryData(a2aKeys.presets(), TEAM_PRESETS);
      client.setQueryData(
        agentKeys.sessionList({ cap: AGENT_BEGIN_RECENTS_CAP }),
        sessionListPage(
          state === "empty"
            ? []
            : [
                sessionRecord(SESSION_ID_NORMAL, "Review harness walkthrough"),
                sessionRecord(SESSION_ID_LOADING, "Author the DiffPanel specimen"),
              ],
        ),
      );
    },
    render: () => <AgentBeginView onSeed={() => {}} />,
  },

  "agent-clarificationcard": {
    host: "w-[26rem]",
    note: "Wire-free: the D5 questionnaire binds authored runId + PendingClarification props. The authored payload carries both question kinds at once, a required choice with option buttons and an optional bounded text, because that is the whole shape the card can render. This surface has no loading or degraded state of its own: it mounts at the park point on a payload the run already delivered, and its one failure branch (a rejected answer) is internal state raised by submitting. Empty is the honest structural case, a payload with no questions where the card renders nothing rather than an empty frame. Noted rather than faked.",
    render: (state) => (
      <ClarificationCard
        runId={TEAM_RUN_ID}
        pending={
          state === "empty"
            ? { requestId: PENDING_CLARIFICATION.requestId, questions: [] }
            : PENDING_CLARIFICATION
        }
      />
    ),
  },

  "agent-teamruntranscript": {
    host: "h-[30rem] w-[26rem] overflow-y-auto",
    note: "Container over the panel team-run slot: it renders nothing without a bound run, so the cell binds one through the real setAgentTeamRun() store action and clears it on unmount. Progress arrives through TeamRunProgressContext, the same context the production provider fills from the relay, supplied here with authored frames so no stream is faked. Renders the ONE transcript kit (user bubble via UserTurnBubble, answers via AgentMessageBlock) with C2/C3 grouping: consecutive reasoning/tool activity folds into one work-stretch disclosure per run of work. Normal is a terminal run carrying all three entry kinds; loading is the same run two frames in and not terminal; empty is a bound run that has emitted nothing yet; degraded appends the engine degraded status frame, the sticky poll-fallback lane.",
    render: (state) => <TeamRunSpecimen state={state} />,
  },

  "agent-agentchip": {
    host: "w-[18rem]",
    note: "Pure presentation: the collapsed-panel chip takes its resolved view and the roving-focus props and owns no store or wire read (the parent resolves useAgentChipView and gates both render and rove on it). The states here are the run postures the chip exists to report. Empty is the real hidden case: useAgentChipView returns null when there is nothing to report and the parent renders no chip at all, so the cell is honestly blank. The chip carries no degraded branch of its own; a degraded plane is reported by the panel it opens, not by the chip.",
    render: (state) => {
      if (state === "empty") return null;
      const view =
        state === "loading"
          ? {
              runStatus: "active" as const,
              workingLabel: "Working",
              stateLabel: "Drafting the specimens",
              accessibleName: "Agent working: drafting the specimens",
            }
          : {
              runStatus: "completed" as const,
              workingLabel: "Agent",
              stateLabel: "Review harness walkthrough",
              accessibleName: "Open the agent panel: review harness walkthrough",
            };
      return (
        <AgentChip
          view={view}
          onToggle={() => {}}
          chipRef={() => {}}
          tabIndex={0}
          onKeyDown={() => {}}
          onFocus={() => {}}
        />
      );
    },
  },

  "agent-pendingchangesbridge": {
    host: "w-[26rem]",
    note: "Container: the transcript inbox bridge counts the review-station rows belonging to the CURRENT session runs, over the same queue authoring.tsx seeds (fixtures imported from there). It renders null when nothing is pending, which is why empty is a blank cell rather than an empty frame: the honest structural state, not a missing specimen. Loading leaves the queue unseeded so the read pends, and the bridge shows no affordance until it knows there is something to bridge to. Degraded seeds a tiers-down queue.",
    seed: (client, state) => {
      seedSessionAndDashboardState(client);
      if (state === "loading") return;
      client.setQueryData(
        authoringKeys.operationMode(),
        "manual" satisfies OperationMode,
      );
      if (state === "empty") {
        client.setQueryData(authoringKeys.proposals(), proposalListResult([]));
        return;
      }
      client.setQueryData(
        authoringKeys.proposals(),
        proposalListResult([PROPOSAL_WITH_RUN], {
          tiers: state === "degraded" ? tiersDown(["structural"]) : undefined,
        }),
      );
    },
    render: (state) => (
      <WithCurrentSession sessionId={state === "empty" ? null : SESSION_ID_NORMAL}>
        <PendingChangesBridge />
      </WithCurrentSession>
    ),
  },
};
