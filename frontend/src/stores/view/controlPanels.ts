// Shared open-state for the framework control panels (activity-rail-realignment
// ADR D3). The rail is status-only; the three admin surfaces — Search service,
// Backend health, Vault health — live in modal control panels toggled from the
// rail-footer status cluster. Each panel is the one modal Dialog idiom over this
// tiny shared view-store flag, mirroring `settingsDialog`, so the chip, the
// command palette, and the keymap all drive the same panel.
//
// Review is NOT a modal panel (review-surface-flow ADR F1): its queue folded into
// the Agent panel as a "Pending changes" view, so it lives on the footer cluster
// as a first-class chip (`FooterChipId`) whose action opens that view — never a
// `ControlPanelId`. The two spaces are deliberately decoupled here.
//
// The panels are MODAL: at most one is open at a time, so the open state is one
// nullable id rather than four independent flags — opening one closes another.
// Non-persisted, like the settings dialog (panels are visited, not lived in).

import { create } from "zustand";

export type ControlPanelId =
  | "search-service"
  | "backend-health"
  | "vault-health"
  | "agent-service";

/** Every modal panel id, in cluster order. The agent-service panel
 *  (a2a-product-provisioning W05.P12) is a MODAL identity only — it is deliberately
 *  NOT a footer chip, so the footer cluster is left unchanged. */
export const CONTROL_PANEL_IDS: readonly ControlPanelId[] = [
  "search-service",
  "backend-health",
  "vault-health",
  "agent-service",
];

/** The rail-footer status chips (activity-rail-realignment ADR D2). A standalone
 *  union — NOT derived from `ControlPanelId` — because two of the three chips open
 *  modal panels while `approvals` opens the Agent panel's pending-changes view
 *  (review-surface-flow ADR F1). Backend health has no chip: its engine-status read
 *  unclearly, so it was pulled from the footer (user UX decision, 2026-07-15); the
 *  Cmd+K palette is its only surfacing path. */
export type FooterChipId = "search-service" | "approvals" | "vault-health";
export const FOOTER_CHIP_IDS: readonly FooterChipId[] = [
  "search-service",
  "approvals",
  "vault-health",
];

/** Every named control surface — the modal panels plus the footer review chip —
 *  the shared vocabulary carries labels for. The review chip (`approvals`) is a
 *  `FooterChipId` only, never a modal `ControlPanelId`. */
export type ControlSurfaceId = ControlPanelId | FooterChipId;

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
