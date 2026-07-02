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
