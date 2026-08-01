// Shared view-state for the Agent panel.
//
// The panel is a non-modal region beside the work surface. Unlike the control
// panels (modal, single-open, visited-not-lived-in), it coexists with the
// editor/graph and holds a running conversation.
// Local chrome only: no wire access lives here; the
// session data is the `stores/server/agent` slice.
//
// WHETHER the panel is mounted is NOT stored here: the panel occupies the center
// dock's ONE reserved slot (agent-panel-shell-integration D1), so "open" IS
// `centerSlot === "agent"` on the canonical shell-layout store, and its geometry
// is dockview's. This slice keeps only what the shell verb cannot carry: which
// VIEW the open panel renders and which session/team run it is bound to.

import { create } from "zustand";

import {
  getShellCenterSlot,
  setShellCenterSlot,
  toggleShellAgentSlot,
  useShellCenterSlot,
} from "./shellLayout";
import { clearClarificationRecaps } from "./clarificationRecaps";

export type TeamRunScopeAction = "keep" | "clear";

/** Decide the synchronous local action when the served active scope changes. */
export function teamRunScopeAction(
  runId: string | null,
  bindingScope: string | null,
  activeScope: string | null,
): TeamRunScopeAction {
  if (runId === null || activeScope === null) return "keep";
  if (bindingScope === null) return "clear";
  return bindingScope === activeScope ? "keep" : "clear";
}

/** Return a team-run id only when its binding belongs to the currently served
 *  scope. Consumers use this during render, before passive cleanup effects. */
export function scopedTeamRunId(
  runId: string | null,
  bindingScope: string | null,
  activeScope: string | null,
): string | null {
  return runId !== null && activeScope !== null && bindingScope === activeScope
    ? runId
    : null;
}

interface AgentPanelState {
  /** Whether the in-conversation "changes awaiting review" region is expanded
   *  (agent-panel-shell-integration D9). The panel has ONE view — the
   *  conversation — and the pending queue is a disclosure INSIDE it, so this is
   *  an open flag on a region, never a view switch; the composer never unmounts. */
  pendingChangesOpen: boolean;
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
   *  while the run itself remains durable in a2a. The original prompt
   *  is intentionally absent after recovery because discovery does not disclose it. */
  teamRunId: string | null;
  teamRunPrompt: string | null;
  /** Scope that owns the current viewing binding. A scope change clears it before
   *  discovery for the next workspace so no run renders under the wrong root. */
  teamRunScope: string | null;
  setPendingChangesOpen: (open: boolean) => void;
  setCurrentSession: (sessionId: string | null) => void;
  setTeamRun: (
    run: { runId: string; prompt: string | null; scope: string } | null,
  ) => void;
}

export const useAgentPanel = create<AgentPanelState>((set) => ({
  pendingChangesOpen: false,
  currentSessionId: null,
  teamRunId: null,
  teamRunPrompt: null,
  teamRunScope: null,
  setPendingChangesOpen: (open) =>
    set((state) =>
      state.pendingChangesOpen === open ? state : { pendingChangesOpen: open },
    ),
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

/** Whether the Agent panel is mounted — i.e. whether it holds the center slot.
 *  Derived, never stored: the slot is the single authority for what the center
 *  renders, so no second open flag can disagree with it. */
export function useAgentPanelOpen(): boolean {
  return useShellCenterSlot() === "agent";
}

export function useAgentPendingChangesOpen(): boolean {
  return useAgentPanel((state) => state.pendingChangesOpen);
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

/** Give the center slot to the Agent panel; `pendingChanges: true` additionally
 *  expands the in-conversation pending-changes region (the footer chip's path —
 *  D9: an expanded disclosure, never a second view). Every entry point — chip,
 *  chord, palette, background menu, comment-send bridge — lands here, so the
 *  slot has one open path. */
export function openAgentPanel(options?: { pendingChanges?: boolean }): void {
  if (options?.pendingChanges === true) setAgentPendingChangesOpen(true);
  setShellCenterSlot("agent");
}

export function setAgentPendingChangesOpen(open: boolean): void {
  useAgentPanel.getState().setPendingChangesOpen(open);
}

/** Empty the center slot when the Agent panel holds it. Never touches the slot
 *  while the graph occupies it — closing a panel that is not open is a no-op, not
 *  a hide of whatever replaced it. */
export function closeAgentPanel(): void {
  if (getShellCenterSlot() === "agent") setShellCenterSlot("none");
}

export function toggleAgentPanel(): void {
  toggleShellAgentSlot();
}

export function setAgentCurrentSession(sessionId: string | null): void {
  useAgentPanel.getState().setCurrentSession(sessionId);
}

/** Bind (or clear, with `null`) the active a2a team run the panel renders. Leaving a
 *  run drops the clarification recaps captured while viewing it: they are scoped to
 *  that viewing, and a new binding must never inherit another run's decisions. */
export function setAgentTeamRun(
  run: { runId: string; prompt: string | null; scope: string } | null,
): void {
  const previous = useAgentPanel.getState().teamRunId;
  if (previous !== null && previous !== run?.runId) clearClarificationRecaps(previous);
  useAgentPanel.getState().setTeamRun(run);
}
