// Shared view-state for the docked Agent panel.
//
// The panel is a non-modal docked region beside the work surface. Unlike the
// control panels (modal, single-open, visited-not-lived-in), it coexists with the
// editor/graph and holds a running conversation. So its open flag is a plain
// boolean and it carries the CURRENT session id the header/transcript render.
// Local chrome only: no wire access lives here; the
// session data is the `stores/server/agent` slice.
//
// The panel's WIDTH is a shell-layout column like the rails, so it lives in the
// canonical shell-layout store (`viewStore` via `shellLayout`), resized by the
// shared `ShellResizeHandle` and reset by "Reset layout".

import { create } from "zustand";

/** The two panel views (review-surface-flow ADR F1): the running conversation and
 *  the folded-in cross-run "Pending changes" inbox. Local chrome — the transcript
 *  is the default; the inbox has no composer of its own. */
export type AgentPanelView = "transcript" | "pending";

interface AgentPanelState {
  /** Whether the docked panel is open. Collapsed, its only trace is the footer
   *  chip (the panel is gone, not merely hidden). */
  open: boolean;
  /** Which view the open panel renders (review-surface-flow ADR F1): the running
   *  transcript (default) or the folded-in pending-changes inbox. */
  panelView: AgentPanelView;
  /** The session the header names and the transcript renders, or `null` when no
   *  session is current (the empty state). */
  currentSessionId: string | null;
  /** The a2a TEAM run currently driving the panel, or `null` when none is active.
   *  Lifted here (not Composer-local) so the Transcript can render the run's live
   *  relayed activity while the Composer owns start/cancel. `prompt` is the message
   *  that started it — the transcript's user-turn text for the team run.
   *
   *  Loss-on-reload is DELIBERATE and honest for now: this is the live viewing
   *  BINDING, not the run — the run stays durable in a2a and every document it
   *  produces lands as a ledgered proposal regardless of reload (a2a-edge ADR D5).
   *  Recovering the binding after reload CANNOT be done client-side today without
   *  inventing state: the `/ops/a2a/*` D1 whitelist has no active-run/run-listing
   *  discovery verb and no served session→run reverse read (persisting the id
   *  client-side would violate "displayed state is backend-served"). Recovery is
   *  GATED on a served active-run read (a reviewed D1-whitelist contract event) —
   *  a cross-team ask filed against a2a. NOTE: a PARTIAL our-side recovery is now
   *  possible for a run that already produced a proposal — `ProposalProjection`
   *  carries `run_id`/`session_id` provenance (agent-wire-gaps D4) — but a run that
   *  is mid-flight before its first proposal still needs the active-run read. */
  teamRunId: string | null;
  teamRunPrompt: string | null;
  /** Open the panel, optionally targeting a view (e.g. the footer Review chip opens
   *  it directly in the pending inbox). Omitting the view leaves the current view. */
  openPanel: (view?: AgentPanelView) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelView: (view: AgentPanelView) => void;
  setCurrentSession: (sessionId: string | null) => void;
  setTeamRun: (run: { runId: string; prompt: string } | null) => void;
}

export const useAgentPanel = create<AgentPanelState>((set) => ({
  open: false,
  panelView: "transcript",
  currentSessionId: null,
  teamRunId: null,
  teamRunPrompt: null,
  openPanel: (view) =>
    set((state) => {
      const nextView = view ?? state.panelView;
      return state.open && state.panelView === nextView
        ? state
        : { open: true, panelView: nextView };
    }),
  closePanel: () => set((state) => (state.open ? { open: false } : state)),
  togglePanel: () => set((state) => ({ open: !state.open })),
  setPanelView: (view) =>
    set((state) => (state.panelView === view ? state : { panelView: view })),
  setCurrentSession: (sessionId) =>
    set((state) =>
      state.currentSessionId === sessionId ? state : { currentSessionId: sessionId },
    ),
  setTeamRun: (run) =>
    set((state) => {
      const nextId = run?.runId ?? null;
      const nextPrompt = run?.prompt ?? null;
      return state.teamRunId === nextId && state.teamRunPrompt === nextPrompt
        ? state
        : { teamRunId: nextId, teamRunPrompt: nextPrompt };
    }),
}));

// --- selector hooks (raw primitives; value-compared, stable) --------------------

export function useAgentPanelOpen(): boolean {
  return useAgentPanel((state) => state.open);
}

export function useAgentPanelView(): AgentPanelView {
  return useAgentPanel((state) => state.panelView);
}

export function useAgentCurrentSessionId(): string | null {
  return useAgentPanel((state) => state.currentSessionId);
}

export function useAgentTeamRunId(): string | null {
  return useAgentPanel((state) => state.teamRunId);
}

export function useAgentTeamRunPrompt(): string | null {
  return useAgentPanel((state) => state.teamRunPrompt);
}

// --- imperative seams (for a chip/action outside a component subscription) -------

export function openAgentPanel(options?: { view?: AgentPanelView }): void {
  useAgentPanel.getState().openPanel(options?.view);
}

export function setAgentPanelView(view: AgentPanelView): void {
  useAgentPanel.getState().setPanelView(view);
}

export function closeAgentPanel(): void {
  useAgentPanel.getState().closePanel();
}

export function toggleAgentPanel(): void {
  useAgentPanel.getState().togglePanel();
}

export function setAgentCurrentSession(sessionId: string | null): void {
  useAgentPanel.getState().setCurrentSession(sessionId);
}

/** Bind (or clear, with `null`) the active a2a team run the panel renders. */
export function setAgentTeamRun(run: { runId: string; prompt: string } | null): void {
  useAgentPanel.getState().setTeamRun(run);
}
