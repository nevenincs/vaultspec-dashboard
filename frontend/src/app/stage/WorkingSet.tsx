// The explicit working set (W02.P06.S25, ADR G3.b): what is currently
// materialized on stage beyond the constellation, shown as a breadcrumb
// chip trail — the user can always answer "why is this node on my screen?"
// Keyboard commands are enrolled in the keymap registry; the clear chip resets
// the working set to the constellation.

import { X } from "lucide-react";

import {
  clearWorkingSet,
  collapseWorkingSet,
  useWorkingSetKeybindings,
  useWorkingSetView,
} from "../../stores/view/workingSet";

// The pure slice union (`mergeSlices`/`WireSlice`) and the merged/display composition
// moved to the stores layer (`stores/view/displaySlice`) per dashboard-layer-ownership
// (GIR-007): that derivation is over the wire model, not view chrome.

// --- the chip trail ----------------------------------------------------------------

interface WorkingSetProps {
  selectedId?: string | null;
  /** The canonical filter visibility membership (the SAME visibleNodeIds truth GS-004
   *  uses on the canvas). A chip whose node is not in this set renders DIMMED with a
   *  "hidden by filter" affordance, so the trail is honest about filter-hidden nodes
   *  (GS-006). Omit / null when no filter membership is available → no dimming. */
  visibleNodeIds?: ReadonlySet<string> | null;
}

export function WorkingSet({
  selectedId: canonicalSelectedId,
  visibleNodeIds = null,
}: WorkingSetProps = {}) {
  const view = useWorkingSetView(visibleNodeIds);
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
        <span
          key={row.id}
          className={row.rootClassName}
          data-working-set-hidden={row.hidden ? "" : undefined}
          title={row.hiddenHint}
          aria-label={row.hidden ? `${row.label} — ${row.hiddenHint}` : undefined}
        >
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
