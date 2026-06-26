import { create } from "zustand";

// Active compact surface (mobile-responsive-layout ADR D6): which single pane the
// compact (phone/tablet) shell shows — the bottom tab bar selects it. This is
// transient presentation chrome, so it lives view-local (like `browserMode`),
// orthogonal to the backend dashboard-state collapse/right_tab seam, and is
// IGNORED on regular (desktop) viewports.
//
// It is device-level, not corpus-level, so — like the viewport class — it carries
// no scope-rekey/reset on a workspace swap (a tab choice does not bleed any corpus
// state). `search` is a momentary pseudo-surface: selecting it opens the
// full-screen command palette (ADR D3) rather than swapping the pane, so the
// stored surface only ever settles on a real pane.
//
// Layer law (dashboard-layer-ownership): pure view-local state — no wire, no
// query cache, no `tiers`. stable-selectors: the hook returns a PRIMITIVE string.

export type CompactSurface = "browse" | "graph" | "timeline" | "status" | "search";

/** The real panes the shell can rest on (everything except the momentary search). */
export type CompactPane = Exclude<CompactSurface, "search">;

interface CompactSurfaceState {
  surface: CompactPane;
  setSurface: (surface: CompactPane) => void;
}

const useCompactSurfaceStore = create<CompactSurfaceState>((set) => ({
  surface: "browse",
  setSurface: (surface) => set({ surface }),
}));

export function useCompactSurface(): CompactPane {
  return useCompactSurfaceStore((state) => state.surface);
}

export function setCompactSurface(surface: CompactPane): void {
  useCompactSurfaceStore.getState().setSurface(surface);
}

export function resetCompactSurface(): void {
  useCompactSurfaceStore.getState().setSurface("browse");
}
