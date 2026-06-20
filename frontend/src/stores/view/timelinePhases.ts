/**
 * The six pipeline-phase lanes the timeline draws, in fixed top-to-bottom
 * pipeline order. These are the engine `LineagePhase` lane tokens and the
 * canonical keys for timeline lane visibility state.
 */
export const PHASE_LANES = [
  "research",
  "adr",
  "plan",
  "exec",
  "review",
  "codify",
] as const;

/** One phase lane id (a `LineagePhase` wire token). */
export type PhaseLane = (typeof PHASE_LANES)[number];
