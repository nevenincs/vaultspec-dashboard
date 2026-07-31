// The specimen registry: one authored entry per principal surface.
//
// A specimen renders the REAL production component — imported from `src/app/` — with
// AUTHORED inputs for one review state. Nothing here fetches, subscribes, or waits on
// an engine: switching state re-renders from different authored props, so a cell can
// be slow or blank only if the component itself is.
//
// Coverage is guarded against the discovered surface inventory (`surfaces.ts`): a
// data-bearing component with no authored entry shows up in the nav and renders a
// loud placeholder, never silently vanishes from the list.

import type { ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { SURFACES, type Surface } from "./surfaces";
import type { ReviewState } from "./state";
import { AREA_SPECIMENS } from "./specimens";

/**
 * A surface deliberately NOT rendered in the four-state matrix, with the reason
 * stated on the desk. Reserved for the scene-owning composites (the WebGL canvas is
 * an app-lifetime, portal-pinned singleton — four simultaneous cells are
 * structurally impossible) whose visual states are the composition of surfaces the
 * desk already reviews. Never a shortcut for "hard to author".
 */
export interface ExcludedSpecimenDef {
  readonly excluded: string;
}

export interface RenderedSpecimenDef {
  /**
   * Render the surface in one review state, from authored inputs only.
   * Where the production file's principal export is a wire-bound container, the
   * specimen renders its wire-free VIEW half (the same file's exported view) and
   * says so in `note`.
   */
  readonly render: (state: ReviewState) => ReactNode;
  /**
   * For a container surface: seed the CELL's own QueryClient with authored data at
   * the real `engineKeys` so the container's own hooks resolve engine-free. A query
   * left unseeded pends forever against the hermetic fetch — which IS the authored
   * `loading` state, so a loading seed usually seeds nothing.
   */
  readonly seed?: (client: QueryClient, state: ReviewState) => void;
  /**
   * The surface portals to `document.body` (dialog, palette, lifted overlay), so it
   * can be neither subtree-themed nor rendered eight times at once. The desk shows
   * it one state at a time under the root theme control.
   */
  readonly solo?: boolean;
  /** Extra classes for the cell host when the surface needs a shaped slot. */
  readonly host?: string;
  /** One plain sentence on how this specimen mounts (e.g. which view half). */
  readonly note?: string;
}

export type SpecimenDef = RenderedSpecimenDef | ExcludedSpecimenDef;

export type Specimen = SpecimenDef & { readonly surface: Surface };

/** Every discovered surface joined with its authored specimen, if any. */
export interface RegistryEntry {
  readonly surface: Surface;
  readonly specimen: Specimen | null;
}

export const REGISTRY: readonly RegistryEntry[] = SURFACES.map((surface) => {
  const def = AREA_SPECIMENS[surface.id];
  return { surface, specimen: def ? { surface, ...def } : null };
});

/** Ids authored but matching no discovered surface — a typo or a renamed file. */
export const ORPHANED_SPECIMEN_IDS: readonly string[] = Object.keys(
  AREA_SPECIMENS,
).filter((id) => !SURFACES.some((s) => s.id === id));

export const UNAUTHORED: readonly Surface[] = REGISTRY.filter(
  (entry) => entry.specimen === null,
).map((entry) => entry.surface);
