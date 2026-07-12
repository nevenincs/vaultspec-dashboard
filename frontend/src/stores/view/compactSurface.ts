import { create } from "zustand";

// Active compact surface (mobile-responsive-layout ADR D6; mobile-unified-rail ADR).
// Which single pane the compact (phone/tablet) shell shows — the bottom tab bar
// selects it. This is transient presentation chrome, so it lives view-local (like
// `browserMode`), orthogonal to the backend dashboard-state collapse/right_tab seam,
// and is IGNORED on regular (desktop) viewports.
//
// The mobile-unified-rail decision merged the former Browse and Status panes into ONE
// scroll surface — `home`, the unified rail (Status section first, then the Browse
// tree). The pane set is therefore `home` + `timeline`; there is no standing `browse`
// or `status` pane. `search` stays a momentary pseudo-surface: selecting it opens the
// full-screen command palette (ADR D3) rather than swapping the pane, so the stored
// surface only ever settles on a real pane.
//
// It is device-level, not corpus-level, so — like the viewport class — it carries no
// scope-rekey/reset on a workspace swap (a tab choice does not bleed any corpus state).
//
// Layer law (dashboard-layer-ownership): pure view-local state — no wire, no query
// cache, no `tiers`. stable-selectors: the hook returns a PRIMITIVE string.

// The graph is desktop-only (ADR D4: not navigable on a phone), so compact has NO
// graph surface or tab — an "unavailable" tab is worse than no tab.
export type CompactSurface = "home" | "timeline" | "search";

/** The real panes the shell can rest on (everything except the momentary search). */
export type CompactPane = Exclude<CompactSurface, "search">;

interface CompactSurfaceState {
  surface: CompactPane;
  setSurface: (surface: CompactPane) => void;
}

const useCompactSurfaceStore = create<CompactSurfaceState>((set) => ({
  surface: "home",
  setSurface: (surface) => set({ surface }),
}));

export function useCompactSurface(): CompactPane {
  return useCompactSurfaceStore((state) => state.surface);
}

export function setCompactSurface(surface: CompactPane): void {
  useCompactSurfaceStore.getState().setSurface(surface);
}

export function resetCompactSurface(): void {
  useCompactSurfaceStore.getState().setSurface("home");
}
