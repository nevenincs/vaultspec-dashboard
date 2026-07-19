// A non-modal, docked, resizable Agent panel beside the work surface.
//
// It is
// mounted once in `AppShell` (like `CreateDocDialog`/`ControlPanels`) as a normal
// in-flow grid child, so the stage's `1fr` column reflows to make room and the
// panel never overlays or modal-blocks the editor. It does not re-parent the
// pinned canvas (it is a sibling region, not inside the dock).
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view. It renders
// the `stores/server/agent` slice (session list + one session snapshot) and emits
// intent through the `stores/view/agentPanel` local chrome store; it fetches
// nothing itself and reads no raw `tiers`. Run/session STATE is read from the
// session snapshot (there is no run-status route on this plane).
//
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
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
import { useActiveScope } from "../../stores/server/queries";
import {
  useReviewStationView,
  useSetOperationMode,
} from "../../stores/server/authoring";
import {
  closeAgentPanel,
  setAgentPanelView,
  setAgentCurrentSession,
  setAgentTeamRun,
  scopedTeamRunId,
  teamRunScopeAction,
  useAgentCurrentSessionId,
  useAgentPanelOpen,
  useAgentPanelView,
  useAgentTeamRunId,
  useAgentTeamRunPrompt,
  useAgentTeamRunScope,
} from "../../stores/view/agentPanel";
import { useAgentPanelWidth } from "../../stores/view/shellLayout";
import {
  agentNewSessionAction,
  endActiveAgentSession,
} from "../../stores/view/agentActions";
import {
  Divider,
  DropdownButton,
  IconButton,
  Popover,
  SectionLabel,
  Segment,
  SegmentedToggle,
  Skeleton,
  SkeletonRow,
  StateBlock,
} from "../kit";
import { AutonomyControl } from "../authoring/ReviewStation";
import { ShellResizeHandle } from "../chrome/ShellResizeHandle";
import { Composer } from "./Composer";
import { PendingChangesBridge } from "./PendingChangesBridge";
import { PendingChangesView } from "./PendingChangesView";
import { Transcript } from "./Transcript";
import { TeamRunTranscript } from "./TeamRunTranscript";
import { TeamRunProgressProvider } from "./TeamRunProgressContext";

const AGENT = {
  region: "common:agent.panel.region",
  sessionsMenu: "common:agent.panel.sessionsMenu",
  newSession: "common:agent.panel.newSession",
  endConversation: "common:agent.panel.endConversation",
  recentSessions: "common:agent.panel.recentSessions",
  untitledSession: "common:agent.panel.untitledSession",
  close: "common:agent.panel.close",
  viewSwitcher: "common:agent.panel.view.switcher",
  viewTranscript: "common:agent.panel.view.transcript",
  viewPending: "common:agent.panel.view.pending",
  loading: "common:agent.transcript.loading",
  empty: "common:agent.transcript.empty",
  noSession: "common:agent.transcript.noSession",
  error: "common:agent.transcript.error",
} as const;

function AgentPanelHeader({ currentSessionId }: { currentSessionId: string | null }) {
  const resolveMessage = useLocalizedMessageResolver();
  const list = useSessionList({ cap: 20 });
  const session = useSession(currentSessionId);
  const [menuOpen, setMenuOpen] = useState(false);

  const untitled = resolveMessage({ key: AGENT.untitledSession }).message;
  const agentLabel = resolveMessage({ key: AGENT.region }).message;
  const newSessionLabel = resolveMessage({ key: AGENT.newSession }).message;
  const endConversationLabel = resolveMessage({ key: AGENT.endConversation }).message;
  const sessionsMenuLabel = resolveMessage({ key: AGENT.sessionsMenu }).message;
  const recentsLabel = resolveMessage({ key: AGENT.recentSessions }).message;

  const title = currentSessionId ? session.data?.session.title || untitled : agentLabel;

  // Whether the current conversation can be explicitly ended (S45): a current,
  // still-active session. Derived from the reactive session query (a loading
  // snapshot is treated as endable so the control is not falsely hidden).
  const canEndConversation =
    currentSessionId !== null &&
    (session.data?.session.status ?? "active") === "active";

  // New session routes through the shared `agent:new-session` descriptor,
  // so the header control and the Cmd+K command are one seam. It clears to a blank
  // composer; the durable session is created by the composer on the first prompt.
  const onNewSession = () => {
    setMenuOpen(false);
    agentNewSessionAction().run?.();
  };

  // End conversation is the EXPLICIT session-cancel (S45): distinct from Stop
  // (run-scoped). Fires the one `endActiveAgentSession` seam.
  const onEndConversation = () => {
    setMenuOpen(false);
    void endActiveAgentSession();
  };

  const recents = list.data?.items ?? [];

  return (
    <header className="flex items-center gap-fg-2 border-b border-rule px-fg-2 py-fg-1-5">
      <div className="relative min-w-0 flex-1">
        <DropdownButton
          label={title}
          open={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          ariaLabel={sessionsMenuLabel}
        />
        {menuOpen && (
          <Popover
            open
            onDismiss={() => setMenuOpen(false)}
            role="menu"
            aria-label={sessionsMenuLabel}
            className="absolute left-0 top-full z-40 mt-fg-1 flex max-h-80 w-64 flex-col gap-fg-1 overflow-y-auto rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-popover"
          >
            <button
              type="button"
              role="menuitem"
              onClick={onNewSession}
              data-agent-new-session
              className="rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-ink transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
            >
              {newSessionLabel}
            </button>
            {canEndConversation && (
              <button
                type="button"
                role="menuitem"
                onClick={onEndConversation}
                data-agent-end-conversation
                className="rounded-fg-sm px-fg-2 py-fg-1 text-left text-label text-state-broken transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50"
              >
                {endConversationLabel}
              </button>
            )}
            {recents.length > 0 && (
              <>
                <Divider />
                <SectionLabel>{recentsLabel}</SectionLabel>
                {recents.map((item) => (
                  <button
                    key={item.session_id}
                    type="button"
                    role="menuitem"
                    aria-current={item.session_id === currentSessionId}
                    onClick={() => {
                      setAgentCurrentSession(item.session_id);
                      setMenuOpen(false);
                    }}
                    className="truncate rounded-fg-sm px-fg-2 py-fg-1 text-left text-meta text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[current=true]:bg-paper-sunken aria-[current=true]:text-ink"
                  >
                    {item.title || untitled}
                  </button>
                ))}
              </>
            )}
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
    // No session: the empty prompt shows ONLY when no team run is carrying the
    // panel; otherwise the team-run block below is the content.
    body =
      teamRunId === null ? (
        <StateBlock
          mode="empty"
          message={resolveMessage({ key: AGENT.noSession }).message}
        />
      ) : null;
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
      className="flex min-h-0 flex-1 flex-col gap-fg-3 overflow-y-auto px-fg-2 py-fg-2"
      data-agent-transcript
      aria-live="polite"
    >
      {body}
      {teamRunId !== null && <TeamRunTranscript />}
    </div>
  );
}

/** The panel-header view switcher (review-surface-flow ADR F1): a two-segment
 *  radiogroup flipping the open panel between the running conversation and the
 *  folded-in "Pending changes" inbox. Local chrome — it writes only the panel's
 *  view-store flag; the transcript is the default. */
function AgentViewSwitcher({ panelView }: { panelView: "transcript" | "pending" }) {
  const resolveMessage = useLocalizedMessageResolver();
  const switcherLabel = resolveMessage({ key: AGENT.viewSwitcher }).message;
  const transcriptLabel = resolveMessage({ key: AGENT.viewTranscript }).message;
  const pendingLabel = resolveMessage({ key: AGENT.viewPending }).message;
  return (
    <div className="border-b border-rule px-fg-2 py-fg-1-5" data-agent-view-switcher>
      <SegmentedToggle
        value={panelView}
        ariaLabel={switcherLabel}
        fullWidth
        onChange={(next) => {
          if (next === "transcript" || next === "pending") setAgentPanelView(next);
        }}
      >
        <Segment value="transcript">{transcriptLabel}</Segment>
        <Segment value="pending">{pendingLabel}</Segment>
      </SegmentedToggle>
    </div>
  );
}

/** The composer-adjacent autonomy control (review-surface-flow ADR F2): the
 *  operation-mode toggle governs THIS conversation's autonomy, so it lives beside
 *  the composer, not in the review inbox. Fed exactly as the retired
 *  `ReviewStationSection` fed it — the SERVED worktree mode (scope-level GET /v1/mode
 *  when the queue is empty, a proposal's policy when not) plus the mode-set seam —
 *  and renders only when a mode is observable (never a fabricated selection). */
export function AgentAutonomyControl() {
  const view = useReviewStationView();
  const setMode = useSetOperationMode();
  if (view.operationMode === null) return null;
  return (
    <div className="border-t border-rule px-fg-2 py-fg-2">
      <AutonomyControl
        mode={view.operationMode}
        onSelect={(mode) => setMode.mutateAsync(mode)}
      />
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

/** The bottom composer slot hosts the multiline composer. */
function AgentComposerSlot() {
  return (
    <div className="border-t border-rule px-fg-2 py-fg-2" data-agent-composer-slot>
      <Composer />
    </div>
  );
}

/**
 * The docked Agent panel. Renders nothing when collapsed (its only trace is the
 * footer `AgentChip`). Open, it occupies its OWN explicit right-most grid track
 * (the shell frame's `agentPanelClassName` pins it to `col-start-4`), so the
 * stage's `1fr` reflows beside it — it never overlays or wraps to a new row. The
 * column width IS the grid track (from the canonical shell-layout store); the
 * shared `ShellResizeHandle` on the panel's left edge drives it.
 */
export function AgentPanel({ className }: { className: string }) {
  useAgentLifecycleSubscription();
  const open = useAgentPanelOpen();
  const panelView = useAgentPanelView();
  useReconcileTeamRunScope();
  const scope = useActiveScope();
  const teamRunId = useAgentTeamRunId();
  const teamRunScope = useAgentTeamRunScope();
  const scopedRunId = scopedTeamRunId(teamRunId, teamRunScope, scope);
  const width = useAgentPanelWidth();
  const currentSessionId = useAgentCurrentSessionId();
  const resolveMessage = useLocalizedMessageResolver();
  if (!open) return null;
  return (
    <aside
      className={className}
      data-agent-panel
      role="complementary"
      aria-label={resolveMessage({ key: AGENT.region }).message}
    >
      <TeamRunProgressProvider runId={scopedRunId}>
        {panelView === "transcript" && teamRunId === null && scope !== null ? (
          <ActiveTeamRunRecovery scope={scope} />
        ) : null}
        <ShellResizeHandle side="agent" axis="agent" current={width} />
        <AgentPanelHeader currentSessionId={currentSessionId} />
        <AgentViewSwitcher panelView={panelView} />
        {panelView === "pending" ? (
          <PendingChangesView />
        ) : (
          <>
            <AgentTranscriptContainer currentSessionId={currentSessionId} />
            {/* Composer-adjacent, transcript-view only: the cross-run bridge into the
              inbox (nothing when the queue is fully represented inline), then the
              autonomy control (nothing until a mode is observable), then the composer. */}
            <PendingChangesBridge />
            <AgentAutonomyControl />
            <AgentComposerSlot />
          </>
        )}
      </TeamRunProgressProvider>
    </aside>
  );
}
