// The phase-lane model (dashboard-timeline ADR "Representation", W03.P05.S32):
// the few-and-fixed framework pipeline phases the relational timeline draws,
// top-to-bottom in pipeline order, plus the pure mapping from a wire
// `LineageNode` (its derived `phase`, with `doc_type` as the deterministic
// fallback) to the lane it sits in, and the lane geometry the renderer reads.
//
// The lane list and type live in `stores/view/timelinePhases` so timeline view
// state and timeline rendering key off the same vocabulary. This module owns the
// render-facing lane descriptors and pure mapping helpers. The doc-type fallback
// mirrors the engine's canonical `phase_for_doc_type` mapping
// (`engine-query/src/pipeline.rs`) exactly: research/reference -> research,
// adr -> adr, plan -> plan, exec -> exec, audit -> review, rule -> codify;
// commits are ambient (not a phase lane, off by default per the ADR) and an
// unknown/absent doc-type owns no lane.
//
// Pure + deterministic: every helper is a referentially-transparent function of
// its inputs (no time, no DOM, no React) so it is fully unit-testable; W03.P06
// renders against the geometry these helpers return.

import { PHASE_LANES, type PhaseLane } from "../../stores/view/timelinePhases";

export { PHASE_LANES, type PhaseLane };

/**
 * The presentational descriptor a lane renders with (binding Figma `Timeline`
 * node 17:647): the human label shown on the lane rail + control chip, and the
 * doc-type mark kind drawn beside it (the `scene/field` domain-mark family —
 * icons-come-from-the-two-sanctioned-families). The lane TOKEN stays the engine
 * wire `LineagePhase` (`review`, `codify`); the LABEL/mark are the doc-type the
 * phase owns, which is what the design and the `.vault/` directory name show:
 * the `review` phase holds `audit` documents (`.vault/audit/`), so its rail reads
 * "audit" with the audit mark — byte-for-byte the Figma lane row. `codify` holds
 * `rule` documents; the domain-mark family carries no rule/codify glyph (adding
 * one is a gated icon change, out of scope here), so that lane renders label-only.
 */
export interface PhaseLaneDescriptor {
  /** The engine wire phase token (the lane's identity + per-lane visibility key). */
  readonly token: PhaseLane;
  /** The human label shown on the lane rail and the control chip. */
  readonly label: string;
  /** The doc-type mark kind drawn beside the label, or null when none ships. */
  readonly markKind: string | null;
}

const PHASE_LANE_DESCRIPTORS: Record<PhaseLane, PhaseLaneDescriptor> = {
  research: { token: "research", label: "research", markKind: "research" },
  adr: { token: "adr", label: "adr", markKind: "adr" },
  plan: { token: "plan", label: "plan", markKind: "plan" },
  exec: { token: "exec", label: "exec", markKind: "exec" },
  // The `review` phase owns the `audit` documents — labeled + marked as "audit",
  // matching Figma's lane rail and the `.vault/audit/` directory name.
  review: { token: "review", label: "audit", markKind: "audit" },
  // The `codify` phase owns `rule` documents; no rule/codify mark ships in-family.
  codify: { token: "codify", label: "codify", markKind: null },
};

/** The presentational descriptor (label + mark) for a phase lane token. */
export function laneDescriptor(lane: PhaseLane): PhaseLaneDescriptor {
  return PHASE_LANE_DESCRIPTORS[lane];
}

/** The human label a lane renders on its rail + chip (Figma 17:647). */
export function laneLabel(lane: PhaseLane): string {
  return PHASE_LANE_DESCRIPTORS[lane].label;
}

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

// --- the binding two-lane grouping (figma-frontend-rewrite W03.P08.S11) ----------
//
// The binding AppShell timeline (Figma `SlhonORmySdoSMTQgDWw3w`, AppShell 117:2
// bottom panel) draws the six pipeline phases collapsed into TWO event lanes: a
// top "design" lane aggregating the research / decision / plan / audit documents,
// and a bottom "execution" lane aggregating the step-record and summary documents.
// The six `PHASE_LANES` tokens above remain the DATA identity (a node's phase, its
// per-phase visibility key, the dated-mark vocabulary); this grouping is only the
// VISUAL lane a mark is drawn in. The control bar's "Steps & summaries" switch
// toggles the execution lane. Figma is binding (figma-is-the-binding-source-of-
// truth) and this two-lane representation supersedes the prior six-row band.

/** A binding visual lane group: a labelled row aggregating several phase lanes. */
export interface TimelineLaneGroup {
  /** The group's stable id (the per-group visibility / data attribute key). */
  readonly id: "design" | "execution";
  /** The human label drawn on the lane rail (the binding middot-joined list). */
  readonly label: string;
  /** The phase tokens whose nodes are drawn in this lane. */
  readonly phases: readonly PhaseLane[];
}

/** One visual lane-group id. */
export type TimelineLaneGroupId = TimelineLaneGroup["id"];

/**
 * The two binding visual lanes, top-to-bottom: the design lane (research +
 * decisions + plans + audits) over the execution lane (steps + summaries). Codify
 * (rules) is a pipeline output with no slot of its own on the binding board, so it
 * rides the execution lane rather than dropping its dated marks.
 */
export const TIMELINE_LANE_GROUPS: readonly TimelineLaneGroup[] = [
  {
    id: "design",
    label: "Research · Decisions · Plans · Audits",
    phases: ["research", "adr", "plan", "review"],
  },
  {
    id: "execution",
    label: "Execution · Summaries",
    phases: ["exec", "codify"],
  },
] as const;

/**
 * Figma renders the design group as two stacked rail labels so Plans/Audits are
 * visible in the narrow gutter. The group label remains one stable identity
 * string; this helper is only the presentational line break.
 */
export function laneGroupLabelLines(group: TimelineLaneGroup): readonly string[] {
  return group.id === "design"
    ? ["Research · Decisions", "Plans · Audits"]
    : [group.label];
}

const GROUP_OF_PHASE: Record<PhaseLane, TimelineLaneGroupId> = {
  research: "design",
  adr: "design",
  plan: "design",
  review: "design",
  exec: "execution",
  codify: "execution",
};

/** The visual lane group a phase token is drawn in. */
export function groupIdOfPhase(phase: PhaseLane): TimelineLaneGroupId {
  return GROUP_OF_PHASE[phase];
}

/** The 0-based vertical index of a lane group (top = design, bottom = execution). */
export function groupIndexOfId(id: TimelineLaneGroupId): number {
  return TIMELINE_LANE_GROUPS.findIndex((g) => g.id === id);
}

/**
 * The visual lane-group index a dated node is drawn in: resolve the node's phase
 * lane (authoritative wire `phase`, doc-type fallback), then map that phase to its
 * group. Returns `null` when the node belongs to no phase lane (an ambient commit,
 * an index doc, an unknown kind) so the renderer places it in no lane.
 */
export function groupIndexOf(node: LaneNode): number | null {
  const li = laneOf(node);
  if (li == null) return null;
  return groupIndexOfId(GROUP_OF_PHASE[PHASE_LANES[li]]);
}

/** The pixel height of one visual lane-group row. */
export const GROUP_LANE_HEIGHT = 30;

/** The y of a group row's vertical centre — where its marks are drawn. */
export function groupLaneCenterY(index: number, topPad = 0): number {
  return index * GROUP_LANE_HEIGHT + GROUP_LANE_HEIGHT / 2 + topPad;
}

/** The total pixel height of the stacked lane-group band plus a top padding. */
export function groupLanesHeight(topPad = 0): number {
  return TIMELINE_LANE_GROUPS.length * GROUP_LANE_HEIGHT + topPad;
}
