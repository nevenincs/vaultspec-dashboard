// Keyboard operability (W03.P12.S48, ADR G7.d): the accessibility floor —
// arrow-walk the graph (left/right cycles the selection's neighbors,
// up/down cycles the feature constellation) and bracket-step the playhead.
// Form fields keep their keys; everything routes through the same shared
// primitives the pointer paths use.

import { useEffect } from "react";

import { useFiltersVocabulary, useNodeNeighbors } from "../../stores/server/queries";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope } from "../stage/Stage";
import { movePlayhead } from "../timeline/Playhead";
import { useTimelineStore } from "../timeline/Timeline";

// --- pure helpers (unit-tested) ----------------------------------------------------

/** Next entry in a cyclic list relative to `current` (or the first). */
export function cycle<T>(list: readonly T[], current: T | null, dir: 1 | -1): T | null {
  if (list.length === 0) return null;
  const index = current === null ? -1 : list.indexOf(current);
  if (index === -1) return list[0];
  return list[(index + dir + list.length) % list.length];
}

/** Bracket-step size: 2% of the window span (≥ one minute). */
export function bracketStep(windowSpanMs: number): number {
  return Math.max(60_000, windowSpanMs * 0.02);
}

/** The playhead position after a bracket step, clamped to [from, now]. */
export function steppedPlayhead(
  current: number | "live",
  dir: 1 | -1,
  window: { from: number; to: number },
  now: number,
): number | "live" {
  const base = current === "live" ? now : current;
  const next = base + dir * bracketStep(window.to - window.from);
  if (next >= now) return "live";
  return Math.max(window.from, next);
}

function isFormTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && /^(input|textarea|select)$/i.test(target.tagName)
  );
}

// --- the global handler ------------------------------------------------------------------

export function KeyboardNav() {
  const scope = useActiveScope();
  const selectedId = useViewStore((s) => s.selectedId);
  const vocabulary = useFiltersVocabulary(scope);
  const neighbors = useNodeNeighbors(selectedId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isFormTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const ids = (neighbors.data?.nodes ?? [])
          .map((n) => n.id)
          .filter((id) => id !== selectedId);
        const next = cycle(ids, null, e.key === "ArrowRight" ? 1 : -1);
        if (next) {
          e.preventDefault();
          selectNode(next);
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const features = (vocabulary.data?.feature_tags ?? []).map(
          (tag) => `feature:${tag}`,
        );
        const next = cycle(features, selectedId, e.key === "ArrowDown" ? 1 : -1);
        if (next) {
          e.preventDefault();
          selectNode(next);
        }
      } else if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        const { window: window_, playheadT } = useTimelineStore.getState();
        movePlayhead(
          steppedPlayhead(playheadT, e.key === "]" ? 1 : -1, window_, Date.now()),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [neighbors.data, vocabulary.data, selectedId]);

  return null;
}
