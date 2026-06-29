import { create } from "zustand";

// Project-navigator chrome: a tiny disclosure store for the standalone
// "Browse or Switch" history popup (the interactive navigator that lists the
// cross-project recents and lets the operator pick, prune, or clear them). The
// history DATA + actions live in the shared `useProjectHistory` seam
// (worktreePickerChrome); this store owns only whether the popup is open.
export interface ProjectNavigatorChromeState {
  open: boolean;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  close: () => void;
}

export const useProjectNavigatorChromeStore = create<ProjectNavigatorChromeState>(
  (set) => ({
    open: false,
    toggleOpen: () => set((state) => ({ open: !state.open })),
    setOpen: (open) => set({ open: open === true }),
    close: () => set({ open: false }),
  }),
);

/** Subscribe to whether the project navigator popup is open (a primitive, so the
 *  selector is referentially safe — stable-selectors). */
export function useProjectNavigatorOpen(): boolean {
  return useProjectNavigatorChromeStore((state) => state.open);
}

/** Open the project navigator from any surface (command, keymap). Idempotent-open. */
export function openProjectNavigator(): void {
  useProjectNavigatorChromeStore.getState().setOpen(true);
}

export function closeProjectNavigator(): void {
  useProjectNavigatorChromeStore.getState().close();
}
