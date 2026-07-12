import { create } from "zustand";

// Open/closed state of the compact unified rail's two top-level sections
// (mobile-unified-rail ADR). The compact (phone/tablet) shell's `home` pane is one
// scroll surface split into a STATUS section (first) and a BROWSE tree section; each
// can be folded independently. Both default to OPEN — the rail reveals its full
// contents until the user chooses to collapse a section.
//
// Like the active compact surface, this is transient presentation chrome, so it lives
// view-local, orthogonal to the backend dashboard-state seam, and is IGNORED on regular
// (desktop) viewports.
//
// It is device-level, not corpus-level, so it carries no scope-rekey/reset on a
// workspace swap (a fold choice does not bleed any corpus state).
//
// Layer law (dashboard-layer-ownership): pure view-local state — no wire, no query
// cache, no `tiers`. stable-selectors: each hook returns a PRIMITIVE boolean.

interface CompactRailSectionsState {
  statusOpen: boolean;
  browseOpen: boolean;
  toggleStatus: () => void;
  toggleBrowse: () => void;
  reset: () => void;
}

const useCompactRailSectionsStore = create<CompactRailSectionsState>((set) => ({
  statusOpen: true,
  browseOpen: true,
  toggleStatus: () => set((state) => ({ statusOpen: !state.statusOpen })),
  toggleBrowse: () => set((state) => ({ browseOpen: !state.browseOpen })),
  reset: () => set({ statusOpen: true, browseOpen: true }),
}));

export function useCompactRailStatusOpen(): boolean {
  return useCompactRailSectionsStore((state) => state.statusOpen);
}

export function useCompactRailBrowseOpen(): boolean {
  return useCompactRailSectionsStore((state) => state.browseOpen);
}

export function toggleCompactRailStatus(): void {
  useCompactRailSectionsStore.getState().toggleStatus();
}

export function toggleCompactRailBrowse(): void {
  useCompactRailSectionsStore.getState().toggleBrowse();
}

export function resetCompactRailSections(): void {
  useCompactRailSectionsStore.getState().reset();
}
