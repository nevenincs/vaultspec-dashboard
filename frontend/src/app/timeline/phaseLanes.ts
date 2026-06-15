// The phase-lane model (dashboard-timeline ADR "Representation", W03.P05.S32):
// the few-and-fixed framework pipeline phases the relational timeline draws,
// top-to-bottom in pipeline order, plus the pure mapping from a wire
// `LineageNode` (its derived `phase`, with `doc_type` as the deterministic
// fallback) to the lane it sits in, and the lane geometry the renderer reads.
//
// THIS is the one source of truth for the lane list and its type — `Timeline.tsx`
// re-exports `PHASE_LANES`/`PhaseLane` from here so the per-lane visibility view
// state keys off the same list (no duplicated lane vocabulary). The doc-type
// fallback mirrors the engine's canonical `phase_for_doc_type` mapping
// (`engine-query/src/pipeline.rs`) exactly: research/reference -> research,
// adr -> adr, plan -> plan, exec -> exec, audit -> review, rule -> codify;
// commits are ambient (not a phase lane, off by default per the ADR) and an
// unknown/absent doc-type owns no lane.
//
// Pure + deterministic: every helper is a referentially-transparent function of
// its inputs (no time, no DOM, no React) so it is fully unit-testable; W03.P06
// renders against the geometry these helpers return.

/**
 * The six pipeline-phase lanes the timeline draws, in fixed top-to-bottom
 * pipeline order: research (research + reference ground the work) -> adr -> plan
 * -> exec -> review (audits) -> codify (rules). The index in this array IS the
 * lane's vertical order. These are the engine `LineagePhase` lane tokens.
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

/**
 * The deterministic doc-type -> phase-lane fallback, mirroring the engine's
 * canonical `phase_for_doc_type` (`engine-query/src/pipeline.rs`): the wire
 * `LineageNode.phase` is authoritative, but when a consumer holds only a
 * `doc_type` (or the phase is somehow absent) this is the same single mapping the
 * engine applies. Returns `null` for a doc-type that owns no phase lane — a
 * `commit` is ambient (toggle-on, not a lane), and `index`/unknown/absent map to
 * no lane so the surface never invents a phase the pipeline does not own.
 */
export function phaseForDocType(docType: string | undefined | null): PhaseLane | null {
  switch (docType) {
    case "research":
    case "reference":
      return "research";
    case "adr":
      return "adr";
    case "plan":
      return "plan";
    case "exec":
      return "exec";
    case "audit":
      return "review";
    case "rule":
      return "codify";
    // `commit` is ambient (no phase lane); `index` and any unknown/absent
    // doc-type own no lane.
    default:
      return null;
  }
}

/**
 * The lane index (0-based vertical order) for a phase token, or `null` if the
 * token is not one of the six phase lanes (a defensive guard against an
 * unexpected wire value — a commit, or a future phase the surface does not draw).
 */
export function laneIndex(phase: string | undefined | null): number | null {
  if (phase == null) return null;
  const i = (PHASE_LANES as readonly string[]).indexOf(phase);
  return i === -1 ? null : i;
}

/**
 * The node shape `laneOf` reads: the wire `LineageNode` carries an authoritative
 * derived `phase`, and a `doc_type` the fallback maps. Both optional so the
 * helper degrades honestly on a partial node rather than throwing.
 */
export interface LaneNode {
  phase?: string | null;
  doc_type?: string | null;
}

/**
 * The lane index a dated node sits in: the authoritative wire `phase` first,
 * falling back to the deterministic `doc_type` mapping when `phase` is absent or
 * not a recognized lane. Returns `null` when the node belongs to no phase lane
 * (an ambient commit, an index doc, an unknown kind) so the renderer can place
 * it in the ambient base rule rather than a phase row.
 */
export function laneOf(node: LaneNode): number | null {
  const fromPhase = laneIndex(node.phase);
  if (fromPhase != null) return fromPhase;
  return laneIndex(phaseForDocType(node.doc_type));
}

/** The pixel height of one phase lane row (the vertical band a mark sits in). */
export const LANE_HEIGHT = 22;

/**
 * The y pixel offset (top of the lane band) for a lane index, given a top
 * padding before the first lane. Pure: `laneIndex * LANE_HEIGHT + topPad`.
 */
export function laneY(index: number, topPad = 0): number {
  return index * LANE_HEIGHT + topPad;
}

/**
 * The y pixel offset of a lane's vertical CENTER — where a mark is drawn — for a
 * lane index, given a top padding before the first lane.
 */
export function laneCenterY(index: number, topPad = 0): number {
  return laneY(index, topPad) + LANE_HEIGHT / 2;
}

/**
 * The total pixel height of all phase lanes stacked, plus a top padding. The
 * renderer sizes the phase-lane band from this.
 */
export function lanesHeight(topPad = 0): number {
  return PHASE_LANES.length * LANE_HEIGHT + topPad;
}
