// Display-slice model derivation (GIR-007): the pure slice union + the merged/
// display composition that the graph stage renders. This is MODEL derivation over
// the wire slices, so per dashboard-layer-ownership it lives in the stores layer,
// not the app view — the stage component just consumes `useDisplaySlice`.

import { useMemo } from "react";

import type { EngineEdge, EngineNode } from "../server/engine";
import { useDashboardVisibilityCommand } from "./dashboardFilterChoices";
import { filterSliceByMembership } from "./filters";
import { useGraphReflowFilter } from "./graphControlsChrome";

// --- pure slice merging (unit-tested) -------------------------------------------

export interface WireSlice {
  nodes: EngineNode[];
  edges: EngineEdge[];
}

/** Union slices by stable id — the constellation plus every expansion. */
export function mergeSlices(
  base: WireSlice,
  expansions: readonly WireSlice[],
): WireSlice {
  const nodes = new Map<string, EngineNode>();
  const edges = new Map<string, EngineEdge>();
  for (const slice of [base, ...expansions]) {
    // Guard a not-yet-resolved (loading) or empty expansion slice — an off-slice
    // working-set ego materialize (activateEntity `frame:true`) folds the node's
    // ego query in BEFORE it resolves, so `nodes`/`edges` can be undefined for a
    // frame; a partial slice simply contributes nothing to the union (Issue #42).
    for (const n of slice.nodes ?? []) nodes.set(n.id, n);
    for (const e of slice.edges ?? []) edges.set(e.id, e);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// --- merged / display composition ----------------------------------------------

export interface DisplaySliceView {
  /** Constellation + working-set expansions, unioned by stable id (or null while
   *  the base slice is loading). */
  merged: WireSlice | null;
  /** What the scene actually renders: `merged` in mask mode, or the reduced
   *  survivor subgraph in reflow mode. */
  displaySlice: WireSlice | null;
  /** Reflow filter mode (true removal vs visibility mask). */
  reflow: boolean;
  /** The canonical visibility membership command for the current filter. */
  visibilityCommand: ReturnType<typeof useDashboardVisibilityCommand>;
}

/**
 * Compose the stage's rendered slice from the base graph slice and the
 * working-set ego expansions. Merges by stable id, then — in reflow filter mode —
 * projects down to the visible membership (true removal) so the live simulation
 * re-forms around the survivors; in mask mode `displaySlice` is `merged` and the
 * visibility command masks hidden nodes downstream.
 *
 * Model derivation over the wire, kept in the stores layer (GIR-007,
 * dashboard-layer-ownership). Each derived value is memoized on its raw inputs so
 * a consumer never sees a fresh reference on an unrelated render.
 */
export function useDisplaySlice(
  scope: string | null,
  slice: { data?: WireSlice },
  expansions: readonly { data?: WireSlice; dataUpdatedAt: number }[],
): DisplaySliceView {
  const expansionData = expansions
    .map((q) => q.data)
    .filter((d): d is NonNullable<typeof d> => d !== undefined);
  // Content signature (P-LOW-5): `dataUpdatedAt` bumps on every successful
  // (re)fetch, so a neighbors refetch returning DIFFERENT data for the same id
  // recomputes `merged` even when the expansion count is unchanged — the old
  // `expansionData.length` proxy missed same-count content changes.
  const expansionSig = expansions.map((q) => q.dataUpdatedAt).join(",");
  const merged = useMemo(
    () => (slice.data ? mergeSlices(slice.data, [...expansionData]) : null),
    [slice.data, expansionSig],
  );
  // Reflow filter mode (graph-controls toggle): ON = filtering REMOVES the
  // filtered-out nodes/edges from the live simulation (true node removal/re-add) so
  // the layout re-forms around the survivors; OFF (default) = the filter is a
  // visibility MASK over the full set (stable positions). Both consume the SAME
  // stores-owned filter membership (the visibility command), so the two modes can
  // never drift — only how the scene receives it differs: reflow feeds a reduced
  // set-data, hide feeds a mask.
  const reflow = useGraphReflowFilter();
  const visibilityCommand = useDashboardVisibilityCommand(scope, merged);
  const displaySlice = useMemo(
    () =>
      reflow && merged && visibilityCommand?.kind === "set-visibility"
        ? filterSliceByMembership(merged, visibilityCommand)
        : merged,
    [reflow, merged, visibilityCommand],
  );
  return { merged, displaySlice, reflow, visibilityCommand };
}
