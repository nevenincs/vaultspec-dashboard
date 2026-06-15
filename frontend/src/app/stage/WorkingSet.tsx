// The explicit working set (W02.P06.S25, ADR G3.b): what is currently
// materialized on stage beyond the constellation, shown as a breadcrumb
// chip trail — the user can always answer "why is this node on my screen?"
// Keyboard E expands the selected node's ego; Backspace collapses the last
// expansion; the clear chip resets to the constellation.

import { X } from "lucide-react";
import { useEffect } from "react";

import type { EngineEdge, EngineNode } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";

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
    for (const n of slice.nodes) nodes.set(n.id, n);
    for (const e of slice.edges) edges.set(e.id, e);
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// --- the chip trail ----------------------------------------------------------------

export function WorkingSet() {
  const workingSet = useViewStore((s) => s.workingSet);
  const selectedId = useViewStore((s) => s.selectedId);
  const add = useViewStore((s) => s.addToWorkingSet);
  const remove = useViewStore((s) => s.removeFromWorkingSet);
  const clear = useViewStore((s) => s.clearWorkingSet);

  // Keyboard: E expands the selection's ego, Backspace collapses (G3.b).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (e.key === "e" || e.key === "E") {
        if (selectedId) add(selectedId);
      } else if (e.key === "Backspace") {
        const last = useViewStore.getState().workingSet.at(-1);
        if (last) {
          e.preventDefault();
          remove(last);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, add, remove]);

  // The trail hides entirely when the working set is empty: the constellation
  // alone needs no provenance.
  if (workingSet.length === 0) return null;
  return (
    <nav
      className="pointer-events-auto absolute top-9 left-2 z-10 flex flex-wrap items-center gap-1"
      aria-label="working set"
      data-working-set
    >
      {/* Working-set size: a data-bearing count, tabular numerals. */}
      <span
        data-tabular
        className="rounded-full bg-paper-sunken px-vs-1-5 py-vs-0-5 text-2xs tabular-nums text-ink-muted"
        aria-label={`${workingSet.length} expansions in working set`}
      >
        {workingSet.length}
      </span>
      {workingSet.map((id) => (
        <span
          key={id}
          className="flex items-center gap-vs-1 rounded-full border border-rule bg-paper-raised px-vs-2 py-vs-0-5 text-2xs text-ink shadow-card"
        >
          {id.replace(/^(feature|doc):/, "")}
          <button
            type="button"
            aria-label={`Collapse ${id}`}
            className="flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            onClick={() => remove(id)}
          >
            <X size={11} aria-hidden />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clear}
        className="rounded-full border border-rule bg-paper-sunken px-vs-2 py-vs-0-5 text-2xs text-ink-muted hover:text-ink transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        clear to constellation
      </button>
    </nav>
  );
}
