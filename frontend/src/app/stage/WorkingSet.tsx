// The explicit working set (W02.P06.S25, ADR G3.b): what is currently
// materialized on stage beyond the constellation, shown as a breadcrumb
// chip trail — the user can always answer "why is this node on my screen?"
// Keyboard commands are enrolled in the keymap registry; the clear chip resets
// the working set to the constellation.

import { X } from "lucide-react";

import type { EngineEdge, EngineNode } from "../../stores/server/engine";
import {
  clearWorkingSet,
  collapseWorkingSet,
  useWorkingSetKeybindings,
  useWorkingSetView,
} from "../../stores/view/workingSet";

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

// --- the chip trail ----------------------------------------------------------------

interface WorkingSetProps {
  selectedId?: string | null;
}

export function WorkingSet({ selectedId: canonicalSelectedId }: WorkingSetProps = {}) {
  const view = useWorkingSetView();
  useWorkingSetKeybindings(canonicalSelectedId ?? null);

  // The trail hides entirely when the working set is empty: the constellation
  // alone needs no provenance.
  if (!view.visible) return null;
  return (
    <nav className={view.navClassName} aria-label={view.navLabel} data-working-set>
      {/* Working-set size: a data-bearing count, tabular numerals. */}
      <span
        data-tabular
        className={view.countClassName}
        aria-label={view.countAriaLabel}
      >
        {view.countLabel}
      </span>
      {view.rows.map((row) => (
        <span key={row.id} className={row.rootClassName}>
          {row.label}
          <button
            type="button"
            aria-label={row.collapseLabel}
            className={row.collapseButtonClassName}
            onClick={() => collapseWorkingSet(row.id)}
          >
            <X size={11} aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clearWorkingSet}
        className={view.clearButtonClassName}
      >
        {view.clearLabel}
      </button>
    </nav>
  );
}
