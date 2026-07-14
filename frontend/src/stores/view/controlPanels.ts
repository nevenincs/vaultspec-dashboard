// Shared open-state for the framework control panels (activity-rail-realignment
// ADR D3). The rail is status-only; the four admin surfaces — Search service,
// Approvals, Backend health, Vault health — live in modal control panels toggled
// from the rail-footer status cluster. Each panel is the one modal Dialog idiom
// over this tiny shared view-store flag, mirroring `settingsDialog`, so the chip,
// the command palette, and the keymap all drive the same panel.
//
// The panels are MODAL: at most one is open at a time, so the open state is one
// nullable id rather than four independent flags — opening one closes another.
// Non-persisted, like the settings dialog (panels are visited, not lived in).

import { create } from "zustand";

export type ControlPanelId =
  | "search-service"
  | "approvals"
  | "backend-health"
  | "vault-health";

/** Every panel id, in cluster order. */
export const CONTROL_PANEL_IDS: readonly ControlPanelId[] = [
  "search-service",
  "approvals",
  "backend-health",
  "vault-health",
];

/** Validate unknown input at the boundary (a persisted blob, a palette id, a wire
 *  value): a known panel id or `null`. */
export function normalizeControlPanelId(value: unknown): ControlPanelId | null {
  return typeof value === "string" &&
    (CONTROL_PANEL_IDS as readonly string[]).includes(value)
    ? (value as ControlPanelId)
    : null;
}

interface ControlPanelsState {
  /** The single open panel, or `null` when every panel is closed. */
  open: ControlPanelId | null;
  openPanel: (id: unknown) => void;
  closePanel: () => void;
  togglePanel: (id: unknown) => void;
}

export const useControlPanels = create<ControlPanelsState>((set) => ({
  open: null,
  openPanel: (id) =>
    set((state) => {
      const normalized = normalizeControlPanelId(id);
      return normalized === null || state.open === normalized
        ? state
        : { open: normalized };
    }),
  closePanel: () => set((state) => (state.open === null ? state : { open: null })),
  togglePanel: (id) =>
    set((state) => {
      const normalized = normalizeControlPanelId(id);
      if (normalized === null) return state;
      return { open: state.open === normalized ? null : normalized };
    }),
}));

/** The currently open panel id, or `null` when none is open. */
export function useOpenControlPanel(): ControlPanelId | null {
  return useControlPanels((state) => state.open);
}

/** Whether a specific panel is the open one. */
export function useControlPanelOpen(id: ControlPanelId): boolean {
  return useControlPanels((state) => state.open === id);
}

export function openControlPanel(id: unknown): void {
  useControlPanels.getState().openPanel(id);
}

export function closeControlPanel(): void {
  useControlPanels.getState().closePanel();
}

export function toggleControlPanel(id: unknown): void {
  useControlPanels.getState().togglePanel(id);
}
