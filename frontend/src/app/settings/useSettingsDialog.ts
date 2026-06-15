// Shared open/close state for the settings dialog (dashboard-settings W04.P09).
// Both entry points — the gear button in the chrome and the command-palette
// "Settings" command — drive the same dialog, so the open flag is a tiny shared
// store rather than per-component state. The dialog itself subscribes and the
// SettingsDialog renders modally over the shell.

import { create } from "zustand";

interface SettingsDialogState {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  toggle: () => void;
}

export const useSettingsDialog = create<SettingsDialogState>((set) => ({
  open: false,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
