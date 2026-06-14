// Lens x mode composition sequencer (graph-representation ADR, W03.P09).
//
// The lens (an engine/wire concern: a query parameter selecting the salience
// field and, via DOI, the served node SET) and the representation mode (a scene
// concern: a CPU-worker spatialization of whatever nodes are served) are
// INDEPENDENT, ORTHOGONAL axes — one selects which nodes and how important, the
// other where they sit — and every lens must be viewable in every mode.
//
// The stores layer owns both active selections and SEQUENCES them so the two
// switches never contend:
//   - a LENS switch is a RE-QUERY that delivers a possibly-different node set,
//     which the active mode then RE-LAYS-OUT with id-keyed object constancy;
//   - a MODE switch RE-LAYS-OUT the current set with NO re-query.
//
// This module is the pure decision: given the previous and next (lens, mode), it
// returns the ordered steps the Stage executes. It owns NO React and NO fetching —
// it decides; the caller (Stage) drives the actual re-query (a TanStack key change)
// and the scene command. Stores-layer module.

import type { SalienceLens } from "../server/engine";
import type { RepresentationMode } from "../../scene/field/representationLayout";

export interface CompositionState {
  lens: SalienceLens;
  mode: RepresentationMode;
}

/** One ordered step the Stage performs to realize a composition transition. */
export type CompositionStep =
  | { kind: "requery"; lens: SalienceLens }
  | { kind: "relayout"; mode: RepresentationMode };

/**
 * Sequence the composition transition from `prev` to `next`.
 *
 * - lens changed: re-query FIRST (deliver the new node set), THEN re-layout with
 *   the (possibly also-changed) mode — the lens drives the set, the mode places
 *   it. Order matters: re-layout must run over the new set, so the re-query
 *   precedes it.
 * - only the mode changed: re-layout the CURRENT set, no re-query.
 * - nothing changed: no steps.
 *
 * Pure and deterministic. Every (lens, mode) pair is reachable — there is no
 * forbidden combination, which is the "every lens in every mode" guarantee.
 */
export function sequenceComposition(
  prev: CompositionState,
  next: CompositionState,
): CompositionStep[] {
  const lensChanged = prev.lens !== next.lens;
  const modeChanged = prev.mode !== next.mode;
  const steps: CompositionStep[] = [];
  if (lensChanged) {
    // Lens switch: re-query first, then the active mode re-lays-out the new set.
    steps.push({ kind: "requery", lens: next.lens });
    steps.push({ kind: "relayout", mode: next.mode });
  } else if (modeChanged) {
    // Mode switch only: re-layout the current set, no re-query.
    steps.push({ kind: "relayout", mode: next.mode });
  }
  return steps;
}

/** Whether the transition requires a wire re-query (a lens change). */
export function requiresRequery(
  prev: CompositionState,
  next: CompositionState,
): boolean {
  return prev.lens !== next.lens;
}
