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
export type TeamRunScopeAction = "keep" | "stamp" | "clear";

/** Decide the synchronous local action when the served active scope changes. */
export function teamRunScopeAction(
  runId: string | null,
  bindingScope: string | null,
  activeScope: string | null,
): TeamRunScopeAction {
  if (runId === null || activeScope === null) return "keep";
  if (bindingScope === null) return "stamp";
  return bindingScope === activeScope ? "keep" : "clear";
}

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
   *  This is still only a viewing BINDING, not durable run ownership: on reload the
   *  engine's bounded `active-runs` read may restore one unambiguous workspace run,
   *  while the run itself remains durable in a2a (edge ADR D5). The original prompt
   *  is intentionally absent after recovery because discovery does not disclose it. */
  teamRunId: string | null;
  teamRunPrompt: string | null;
  /** Scope that owns the current viewing binding. A scope change clears it before
   *  discovery for the next workspace so no run renders under the wrong root. */
  teamRunScope: string | null;
  /** Open the panel, optionally targeting a view (e.g. the footer Review chip opens
   *  it directly in the pending inbox). Omitting the view leaves the current view. */
  openPanel: (view?: AgentPanelView) => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelView: (view: AgentPanelView) => void;
  setCurrentSession: (sessionId: string | null) => void;
  setTeamRun: (
    run: { runId: string; prompt: string | null; scope?: string | null } | null,
  ) => void;
}

export const useAgentPanel = create<AgentPanelState>((set) => ({
  open: false,
  panelView: "transcript",
  currentSessionId: null,
  teamRunId: null,
  teamRunPrompt: null,
  teamRunScope: null,
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
      const nextScope = run?.scope ?? null;
      return state.teamRunId === nextId &&
        state.teamRunPrompt === nextPrompt &&
        state.teamRunScope === nextScope
        ? state
        : { teamRunId: nextId, teamRunPrompt: nextPrompt, teamRunScope: nextScope };
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

export function useAgentTeamRunScope(): string | null {
  return useAgentPanel((state) => state.teamRunScope);
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
export function setAgentTeamRun(
  run: { runId: string; prompt: string | null; scope?: string | null } | null,
): void {
  useAgentPanel.getState().setTeamRun(run);
}
