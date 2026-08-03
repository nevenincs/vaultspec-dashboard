// A non-modal Agent panel beside the work surface.
//
// It is the center dock's reserved `__agent__` panel
// (agent-panel-shell-integration D1): the same slot, and the same
// shell-verb-reconciled treatment, the graph already had. So it reflows beside the
// open documents inside the one dock row — the owner's default [document | agent]
// split — instead of taking a fourth shell column, and it never overlays or
// modal-blocks the editor. The body is plain React (no portal): its state lives in
// external stores, so dockview may mount and unmount it freely. The panel is
// mounted ONLY while it holds the slot, so nothing app-lifetime may live here.
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view. It renders
// the `stores/server/agent` slice (session list + one session snapshot) and emits
// intent through the `stores/view/agentPanel` local chrome store; it fetches
// nothing itself and reads no raw `tiers`. Run/session STATE is read from the
// session snapshot (there is no run-status route on this plane).
//
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Archive, History, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import {
  useAgentLifecycleSubscription,
  useSession,
  useSessionList,
} from "../../stores/server/agent";
import {
  a2aKeys,
  recoverableActiveRunId,
  useActiveTeamRuns,
} from "../../stores/server/agent/a2aTeam";
import type { ProviderCondition } from "../../stores/server/agent/providerCondition";
import { useActiveScope } from "../../stores/server/queries";
import {
  closeAgentPanel,
  setAgentCurrentSession,
  setAgentTeamRun,
  scopedTeamRunId,
  teamRunProviderCondition,
  teamRunScopeAction,
  useAgentCurrentSessionId,
  useAgentPendingChangesOpen,
  useAgentTeamRunId,
  useAgentTeamRunPrompt,
  useAgentTeamRunScope,
} from "../../stores/view/agentPanel";
import {
  agentNewSessionAction,
  archiveAgentSession,
} from "../../stores/view/agentActions";
import {
  DropdownButton,
  IconButton,
  Popover,
  SectionLabel,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";
import { Composer } from "./Composer";
import { AgentBeginView } from "./AgentBeginView";
import { agentComposerPosture } from "./agentBegin";
import { setComposerDraft } from "./composerDraft";
import { PendingChangesBridge } from "./PendingChangesBridge";
import { PendingChangesView } from "./PendingChangesView";
import { Transcript } from "./Transcript";
import { TeamRunTranscript } from "./TeamRunTranscript";
import { TeamRunProgressProvider, useTeamRunProgress } from "./TeamRunProgressContext";
import { TeamRunHeader } from "./TeamRunHeader";
import { deriveTeamRoster } from "./teamRun";

const AGENT = {
  region: "common:agent.panel.region",
  conversationMenu: "common:agent.panel.conversationMenu",
  newSession: "common:agent.panel.newSession",
  archiveSession: "common:agent.panel.archiveSession",
  history: "common:agent.panel.history",
  recentSessions: "common:agent.panel.recentSessions",
  untitledSession: "common:agent.panel.untitledSession",
  close: "common:agent.panel.close",
  loading: "common:agent.transcript.loading",
  empty: "common:agent.transcript.empty",
  error: "common:agent.transcript.error",
  failureDetail: "common:agent.runFailure.detail",
} as const;

/** One remediation per member of the closed refusal vocabulary. The mapping is
 *  exhaustive by construction, so a member added upstream cannot ship with no way
 *  to tell the reader what to do about it. */
const RUN_FAILURE = {
  network_unreachable: "common:agent.runFailure.networkUnreachable",
  provider_overloaded: "common:agent.runFailure.providerOverloaded",
  unauthenticated: "common:agent.runFailure.unauthenticated",
  throttled: "common:agent.runFailure.throttled",
  usage_exhausted: "common:agent.runFailure.usageExhausted",
  credits_exhausted: "common:agent.runFailure.creditsExhausted",
  budget_exhausted: "common:agent.runFailure.budgetExhausted",
  invalid_request: "common:agent.runFailure.invalidRequest",
  unknown: "common:agent.runFailure.unknown",
} as const satisfies Readonly<Record<ProviderCondition, string>>;

/** Display bound for the served account of a failure. It is opaque prose of no
 *  promised length, and it sits in docked chrome that must not grow without end. */
const FAILURE_DETAIL_MAX = 240;

/** The panel header, on the captured reference grammar (D10): the open
 *  conversation's TITLE with its own conversation-actions menu (the
 *  title-with-menu idiom — Archive lives here, navigation never does), then New,
 *  History (the recents popover), and Close. "End conversation" does not exist:
 *  agents are STOPPED (composer run slot), sessions are ARCHIVED. */
function AgentPanelHeader({ currentSessionId }: { currentSessionId: string | null }) {
  const resolveMessage = useLocalizedMessageResolver();
  const list = useSessionList({ cap: 20 });
  const session = useSession(currentSessionId);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const untitled = resolveMessage({ key: AGENT.untitledSession }).message;
  const agentLabel = resolveMessage({ key: AGENT.region }).message;
  const newSessionLabel = resolveMessage({ key: AGENT.newSession }).message;
  const archiveLabel = resolveMessage({ key: AGENT.archiveSession }).message;
  const historyLabel = resolveMessage({ key: AGENT.history }).message;
  const conversationMenuLabel = resolveMessage({ key: AGENT.conversationMenu }).message;
  const recentsLabel = resolveMessage({ key: AGENT.recentSessions }).message;

  const title = currentSessionId ? session.data?.session.title || untitled : agentLabel;
  const recents = list.data?.items ?? [];

  // New conversation routes through the shared `agent:new-session` descriptor, so
  // the header control and the Cmd+K command are one seam. It clears to a blank
  // composer; the durable session is created by the composer on the first prompt.
  const onNewSession = () => {
    setHistoryOpen(false);
    agentNewSessionAction().run?.();
  };

  const onArchive = (sessionId: string) => {
    setTitleMenuOpen(false);
    setHistoryOpen(false);
    void archiveAgentSession(sessionId);
  };

  return (
    <header className="flex items-center gap-fg-1 border-b border-rule px-fg-3 py-fg-2">
      <div className="relative min-w-0 flex-1">
        {currentSessionId === null ? (
          // No open conversation: nothing conversation-scoped to offer, so the
          // title is plain text rather than an empty menu pretending otherwise.
          <span className="block truncate text-body text-ink" data-agent-title>
            {title}
          </span>
        ) : (
          <>
            <DropdownButton
              label={title}
              open={titleMenuOpen}
              onClick={() => setTitleMenuOpen((open) => !open)}
              ariaLabel={conversationMenuLabel}
            />
            {titleMenuOpen && (
              <Popover
                open
                onDismiss={() => setTitleMenuOpen(false)}
                role="menu"
                aria-label={conversationMenuLabel}
                className="absolute left-0 top-full z-40 mt-fg-1 flex w-56 flex-col gap-fg-1 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onArchive(currentSessionId)}
                  data-agent-archive-session
                  className="flex items-center gap-fg-2 rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                >
                  <Archive size={14} aria-hidden className="shrink-0 text-ink-faint" />
                  {archiveLabel}
                </button>
              </Popover>
            )}
          </>
        )}
      </div>
      <IconButton label={newSessionLabel} onClick={onNewSession} data-agent-new-session>
        <Plus size={16} aria-hidden />
      </IconButton>
      <div className="relative">
        <IconButton
          label={historyLabel}
          onClick={() => setHistoryOpen((open) => !open)}
          data-agent-history
        >
          <History size={16} aria-hidden />
        </IconButton>
        {historyOpen && (
          <Popover
            open
            onDismiss={() => setHistoryOpen(false)}
            role="menu"
            aria-label={historyLabel}
            data-agent-history-menu
            className="absolute right-0 top-full z-40 mt-fg-1 flex max-h-80 w-64 flex-col gap-fg-0-5 overflow-y-auto rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
          >
            <SectionLabel>{recentsLabel}</SectionLabel>
            {recents.map((item) => (
              <div key={item.session_id} className="flex items-center gap-fg-1">
                <button
                  type="button"
                  role="menuitem"
                  aria-current={item.session_id === currentSessionId}
                  onClick={() => {
                    setAgentCurrentSession(item.session_id);
                    setHistoryOpen(false);
                  }}
                  className="min-w-0 flex-1 truncate rounded-fg-sm px-fg-2 py-fg-1 text-left text-meta text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[current=true]:bg-paper-sunken aria-[current=true]:text-ink"
                >
                  {item.title || untitled}
                </button>
                <IconButton
                  label={archiveLabel}
                  onClick={() => onArchive(item.session_id)}
                  data-agent-archive-recent={item.session_id}
                >
                  <Archive size={14} aria-hidden />
                </IconButton>
              </div>
            ))}
          </Popover>
        )}
      </div>
      <IconButton
        label={resolveMessage({ key: AGENT.close }).message}
        onClick={closeAgentPanel}
      >
        <X size={16} aria-hidden />
      </IconButton>
    </header>
  );
}

function AgentTranscriptContainer({
  currentSessionId,
}: {
  currentSessionId: string | null;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const session = useSession(currentSessionId);
  // A team run renders independently of a single-agent session (the two planes are
  // distinct); it may be active with no session at all. So the session branching
  // only decides the SESSION body, and the team-run block mounts alongside it.
  const scope = useActiveScope();
  const storedTeamRunId = useAgentTeamRunId();
  const teamRunScope = useAgentTeamRunScope();
  const teamRunId = scopedTeamRunId(storedTeamRunId, teamRunScope, scope);

  let body: ReactNode;
  if (currentSessionId === null) {
    // No session AND this container mounted means a team run is carrying the panel
    // (the begin idiom owns the no-session case now — D2). So there is no
    // single-agent body to render, and the team-run block below is the content. The
    // former "Message the agent to start a conversation" empty block is RETIRED with
    // its key: it became unreachable the moment the begin state took that state over.
    body = null;
  } else if (session.isLoading) {
    body = (
      <Skeleton label={resolveMessage({ key: AGENT.loading }).message}>
        <SkeletonRow width="w-3/4" boxed />
        <SkeletonRow width="w-2/3" boxed />
      </Skeleton>
    );
  } else if (session.isError) {
    // getSession FAULTS (422) on an unknown/expired id — surface it honestly,
    // never a fabricated empty snapshot.
    body = (
      <StateBlock
        mode="degraded"
        message={resolveMessage({ key: AGENT.error }).message}
      />
    );
  } else if ((session.data?.turns.length ?? 0) === 0) {
    body = (
      <StateBlock mode="empty" message={resolveMessage({ key: AGENT.empty }).message} />
    );
  } else {
    // The reconciled fixed-order transcript (S13): snapshot turns/runs grafted
    // with the client-held annex, collapse-on-settle, bounded window.
    body = <Transcript snapshot={session.data!} />;
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-fg-4 overflow-y-auto px-fg-3 py-fg-3"
      data-agent-transcript
      aria-live="polite"
    >
      {body}
      {teamRunId !== null && <TeamRunTranscript />}
    </div>
  );
}

/** Reload-recovery of the team-run viewing binding (a2a-orchestration-edge D5):
 *  when the panel is open with NO run bound, discover the workspace's live runs
 *  (`GET /ops/a2a active-runs`) and re-bind the single unambiguous one, so a
 *  reloaded panel resumes its live transcript instead of losing it. Deliberately
 *  conservative — multiple or truncated results stay unrecovered, and the rebound
 *  run carries no prompt because discovery is identity-only. The query is mounted
 *  only for the visible transcript while recovery is needed. */
function useReconcileTeamRunScope(): void {
  const scope = useActiveScope();
  const teamRunId = useAgentTeamRunId();
  const teamRunPrompt = useAgentTeamRunPrompt();
  const teamRunScope = useAgentTeamRunScope();

  // Unknown or cross-scope provenance is cleared before this workspace's
  // discovery can attach, so a run can never render under an inferred root.
  useEffect(() => {
    if (teamRunId === null || scope === null) return;
    const action = teamRunScopeAction(teamRunId, teamRunScope, scope);
    if (action === "clear") setAgentTeamRun(null);
  }, [scope, teamRunId, teamRunPrompt, teamRunScope]);
}

/** Mounted only while recovery is active. `refetchOnMount:"always"` therefore
 * turns every close/reopen or pending/transcript transition into a fresh bounded
 * discovery read, instead of resurrecting a cached zero/ambiguous result. */
function ActiveTeamRunRecovery({ scope }: { scope: string }) {
  const queryClient = useQueryClient();
  const active = useActiveTeamRuns(scope);
  const recoverableRunId =
    active.isSuccess && !active.isFetching ? recoverableActiveRunId(active.data) : null;

  useEffect(() => {
    if (recoverableRunId === null) return;
    setAgentTeamRun({ runId: recoverableRunId, prompt: null, scope });
    queryClient.removeQueries({ queryKey: a2aKeys.activeRuns(scope), exact: true });
  }, [queryClient, recoverableRunId, scope]);

  return null;
}

/** The run header's slot. It reads the progress context, so it must live INSIDE
 *  the provider — hence a component rather than an inline derivation in the panel
 *  body. The roster walk is memoized off the raw frames. */
function AgentRunHeaderSlot() {
  const progress = useTeamRunProgress();
  const frames = progress.frames;
  // The AUTHORITATIVE status seeds the roster (it survives a reload; relay frames do
  // not), and the frozen profile's assignments bind each role to its provider/model.
  const status = progress.status;
  const roster = useMemo(() => deriveTeamRoster(frames, status), [frames, status]);
  return <TeamRunHeader roster={roster} />;
}

/** The refused-run slot, docked beside the conversation like the run header: a run
 *  that was refused is run metadata, and burying it in the scrolling transcript is
 *  how a reader misses the one thing they can act on.
 *
 *  The remediation is chosen from the CLASSIFICATION alone. The served sentence is
 *  rendered under it as opaque detail and is never read to decide anything: a run
 *  refused for an exhausted balance has been observed carrying a sentence that
 *  names a retry step, so a remedy chosen from prose would be the wrong remedy.
 *
 *  All nine members share the sanctioned degraded mark rather than each taking an
 *  expressive glyph of its own (state-mode-uniformity): a reader comparing two
 *  refusals must not read a glyph change as a severity change. What distinguishes
 *  them is the remedy, which is the thing that actually differs. */
function AgentRunFailureSlot() {
  const resolveMessage = useLocalizedMessageResolver();
  const progress = useTeamRunProgress();
  const condition = teamRunProviderCondition(progress.status, progress.frames);
  if (condition === null) return null;
  const account = progress.status?.failure_reason ?? "";
  const detail =
    account.length > FAILURE_DETAIL_MAX
      ? `${account.slice(0, FAILURE_DETAIL_MAX)}…`
      : account;
  return (
    <div className="border-b border-rule" data-agent-run-failure={condition}>
      <StateBlock
        mode="degraded"
        message={resolveMessage({ key: RUN_FAILURE[condition] }).message}
      />
      {detail.length > 0 && (
        <p
          className="px-fg-3 pb-fg-3 text-center text-meta text-ink-faint"
          data-agent-run-failure-detail
        >
          {
            resolveMessage({
              key: AGENT.failureDetail,
              values: { detail: authoredDisplayText(detail) },
            }).message
          }
        </p>
      )}
    </div>
  );
}

/** The CONTINUE posture's composer slot: docked at the panel bottom beneath the
 *  transcript (research G8 — position encodes posture). The begin posture renders
 *  the same component centered instead, from `AgentBeginView`. */
function AgentComposerSlot() {
  return (
    <div className="border-t border-rule px-fg-3 py-fg-3" data-agent-composer-slot>
      <Composer />
    </div>
  );
}

/**
 * The shared durable lifecycle connection for the agent surface. It must outlive
 * the panel — the footer `AgentChip` traces a streaming run precisely while the
 * panel does NOT hold the center slot — so it is mounted by the shell, not by the
 * panel body, which now unmounts whenever the graph takes the slot back.
 */
export function AgentLifecycleHost() {
  useAgentLifecycleSubscription();
  return null;
}

/**
 * The Agent panel body, hosted by the center dock's reserved `__agent__` panel. It
 * fills its dock panel (the dock owns the geometry — there is no panel-owned width
 * or resize handle any more; the dock sash between the documents and the slot is
 * the one size control). It renders only while it holds the slot: `centerSlot`
 * decides that, and the header's close control hands the slot back.
 */
export function AgentPanel() {
  const pendingChangesOpen = useAgentPendingChangesOpen();
  useReconcileTeamRunScope();
  const scope = useActiveScope();
  const teamRunId = useAgentTeamRunId();
  const teamRunScope = useAgentTeamRunScope();
  const scopedRunId = scopedTeamRunId(teamRunId, teamRunScope, scope);
  const currentSessionId = useAgentCurrentSessionId();
  const resolveMessage = useLocalizedMessageResolver();
  // The BEGIN idiom (D2, research G8): with nothing to continue, the panel's whole
  // content is the centered composer under a scope-named headline. The session read
  // here is the same cached query the transcript container consumes, so the posture
  // costs no extra wire work.
  const session = useSession(currentSessionId);
  const posture = agentComposerPosture({
    sessionId: currentSessionId,
    hasTurns: (session.data?.turns.length ?? 0) > 0,
    teamRunId: scopedRunId,
    transcriptUnsettled:
      currentSessionId !== null && (session.isLoading || session.isError),
  });
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col bg-paper"
      data-agent-panel
      role="region"
      aria-label={resolveMessage({ key: AGENT.region }).message}
    >
      <TeamRunProgressProvider runId={scopedRunId}>
        {teamRunId === null && scope !== null ? (
          <ActiveTeamRunRecovery scope={scope} />
        ) : null}
        <AgentPanelHeader currentSessionId={currentSessionId} />
        {/* C5: live run metadata DOCKS beside the conversation — between the header
            and the transcript in both postures, never scrolled away inside flow. */}
        <AgentRunHeaderSlot />
        {/* A refusal outlives the posture that produced it: the panel returns to
            the begin idiom once a failed run leaves nothing to continue, and the
            reason it stopped is exactly what must survive that. */}
        <AgentRunFailureSlot />
        {posture === "begin" ? (
          /* Nothing to continue: the composer IS the content, centered under the
             headline (G1/G8). The cross-run bridge still rides above it — a proposal
             waiting from an earlier run is exactly the thing a fresh start should
             not hide. The autonomy control travels INSIDE the composer (D3 row-2
             left), so it needs no slot of its own in either posture. */
          <>
            <PendingChangesBridge />
            {pendingChangesOpen && <PendingChangesView />}
            <AgentBeginView onSeed={setComposerDraft} />
          </>
        ) : (
          /* ONE view (D9): the conversation. The pending queue is an in-flow
             disclosure the bridge expands ABOVE the composer — the composer never
             unmounts, and no view switch exists. */
          <>
            <AgentTranscriptContainer currentSessionId={currentSessionId} />
            <PendingChangesBridge />
            {pendingChangesOpen && <PendingChangesView />}
            <AgentComposerSlot />
          </>
        )}
      </TeamRunProgressProvider>
    </section>
  );
}
