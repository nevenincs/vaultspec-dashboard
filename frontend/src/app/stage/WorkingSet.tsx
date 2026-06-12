// The explicit working set (W02.P06.S25, ADR G3.b): what is currently
// materialized on stage beyond the constellation, shown as a breadcrumb
// chip trail — the user can always answer "why is this node on my screen?"
// Keyboard E expands the selected node's ego; Backspace collapses the last
// expansion; the clear chip resets to the constellation.

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

  if (workingSet.length === 0) return null;
  return (
    <nav
      className="pointer-events-auto absolute top-9 left-2 z-10 flex flex-wrap items-center gap-1"
      aria-label="working set"
    >
      {workingSet.map((id) => (
        <span
          key={id}
          className="flex items-center gap-1 rounded-full border border-stone-300 bg-white/90 px-2 py-0.5 text-[10px] text-stone-700 shadow-sm"
        >
          {id.replace(/^(feature|doc):/, "")}
          <button
            type="button"
            aria-label={`Collapse ${id}`}
            className="text-stone-400 hover:text-stone-900"
            onClick={() => remove(id)}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clear}
        className="rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500 hover:text-stone-900"
      >
        clear to constellation
      </button>
    </nav>
  );
}
