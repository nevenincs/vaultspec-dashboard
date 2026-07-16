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

interface AgentPanelState {
  /** Whether the docked panel is open. Collapsed, its only trace is the footer
   *  chip (the panel is gone, not merely hidden). */
  open: boolean;
  /** The session the header names and the transcript renders, or `null` when no
   *  session is current (the empty state). */
  currentSessionId: string | null;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setCurrentSession: (sessionId: string | null) => void;
}

export const useAgentPanel = create<AgentPanelState>((set) => ({
  open: false,
  currentSessionId: null,
  openPanel: () => set((state) => (state.open ? state : { open: true })),
  closePanel: () => set((state) => (state.open ? { open: false } : state)),
  togglePanel: () => set((state) => ({ open: !state.open })),
  setCurrentSession: (sessionId) =>
    set((state) =>
      state.currentSessionId === sessionId ? state : { currentSessionId: sessionId },
    ),
}));

// --- selector hooks (raw primitives; value-compared, stable) --------------------

export function useAgentPanelOpen(): boolean {
  return useAgentPanel((state) => state.open);
}

export function useAgentCurrentSessionId(): string | null {
  return useAgentPanel((state) => state.currentSessionId);
}

// --- imperative seams (for a chip/action outside a component subscription) -------

export function openAgentPanel(): void {
  useAgentPanel.getState().openPanel();
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
