// Shared open/close state for the settings dialog (dashboard-settings W04.P09).
// Both entry points — chrome and the command-palette "Settings" command — drive
// the same dialog, so the open flag is a tiny shared view-store concept rather
// than per-component state. The dialog remains app chrome; the mutable singleton
// lives in stores/view with other shared chrome state.

import { create } from "zustand";

interface SettingsDialogState {
  open: boolean;
  setOpen: (open: unknown) => void;
  openDialog: () => void;
  closeDialog: () => void;
  toggle: () => void;
}

export const useSettingsDialog = create<SettingsDialogState>((set) => ({
  open: false,
  setOpen: (open) =>
    set((state) => {
      const normalized = normalizeSettingsDialogOpen(open);
      return normalized === null || state.open === normalized
        ? state
        : { open: normalized };
    }),
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
  toggle: () =>
    set((state) => ({
      open: !(normalizeSettingsDialogOpen(state.open) ?? false),
    })),
}));

export function normalizeSettingsDialogOpen(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function useSettingsDialogOpen(): boolean {
  return useSettingsDialog(
    (state) => normalizeSettingsDialogOpen(state.open) ?? false,
  );
}

export function setSettingsDialogOpen(open: unknown): void {
  useSettingsDialog.getState().setOpen(open);
}

export function openSettingsDialog(): void {
  useSettingsDialog.getState().openDialog();
}

export function closeSettingsDialog(): void {
  useSettingsDialog.getState().closeDialog();
}

export function toggleSettingsDialog(): void {
  useSettingsDialog.getState().toggle();
}
