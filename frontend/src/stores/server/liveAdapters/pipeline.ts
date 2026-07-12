// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import { normalizeNodeId } from "../../nodeIds";
import type {
  InteriorPhase,
  InteriorRollup,
  InteriorStep,
  InteriorWave,
  PipelineArtifact,
  PipelinePhase,
  PipelineResponse,
  PlanInterior,
  PlanInteriorResponse,
  PlanSummary,
  TiersBlock,
} from "../engine";
import { isRec } from "./internal";

// --- pipeline / plan-interior / git (dashboard-pipeline-wire W05.P11.S61) ---------
//
// Tolerant adapters for the three new wire capabilities, mirroring adaptGraphSlice:
// the live `{data, tiers}` envelope is already unwrapped by `unwrapEnvelope` before
// these run, and a body already in the internal shape (the mock) passes through
// unchanged — the one-code-path property. Every missing field defaults to a safe
// empty so a sparse or older shape NEVER throws and the chrome never reads the raw
// tiers block (degradation truth rides on `tiers`, defaulted to an empty block).

const PIPELINE_PHASES: PipelinePhase[] = [
  "research",
  "adr",
  "plan",
  "execute",
  "review",
];

function normalizePipelineString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePipelineStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizePipelineString(entry);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.length > 0 ? out : undefined;
}

function normalizePipelinePhase(value: unknown): PipelinePhase {
  const normalized = normalizePipelineString(value);
  return normalized !== undefined && (PIPELINE_PHASES as string[]).includes(normalized)
    ? (normalized as PipelinePhase)
    : "plan";
}

/** Default one in-flight artifact wire row, tolerating an absent or partial
 *  object. An unknown phase falls back to `plan` (the safe neutral phase); the
 *  optional status/tier/progress are forwarded only when present. */
function adaptPipelineArtifact(value: unknown): PipelineArtifact | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  if (nodeId === null) return null;
  const phase = normalizePipelinePhase(value.phase);
  const progress =
    isRec(value.progress) &&
    typeof value.progress.done === "number" &&
    Number.isFinite(value.progress.done) &&
    typeof value.progress.total === "number" &&
    Number.isFinite(value.progress.total)
      ? { done: value.progress.done, total: value.progress.total }
      : undefined;
  // Dates (dashboard-pipeline-status W01): forwarded only when a dates object is
  // present, so the row's freshness stamp is hidden on truthful absence.
  const dates = isRec(value.dates)
    ? {
        created: normalizePipelineString(value.dates.created),
        modified: normalizePipelineString(value.dates.modified),
      }
    : undefined;
  return {
    node_id: nodeId,
    stem: normalizePipelineString(value.stem) ?? "",
    title: normalizePipelineString(value.title),
    doc_type: normalizePipelineString(value.doc_type),
    status: normalizePipelineString(value.status),
    tier: normalizePipelineString(value.tier),
    progress,
    feature_tags: normalizePipelineStringList(value.feature_tags),
    dates,
    phase,
  };
}

/** Live `/pipeline` → the internal pipeline response. TOLERANT: an absent
 *  `artifacts` array defaults to empty (the Work pillar renders its empty state). */
export function adaptPipeline(body: unknown): PipelineResponse {
  if (!isRec(body)) return { artifacts: [], tiers: {} };
  return {
    artifacts: Array.isArray(body.artifacts)
      ? body.artifacts
          .map(adaptPipelineArtifact)
          .filter((artifact): artifact is PipelineArtifact => artifact !== null)
      : [],
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Default one interior step wire row. `done` defaults to false (an unmarked
 *  step is open, never wrongly shown complete); the optional action and exec
 *  binding are forwarded only when present. */
/** A non-negative integer count, defaulting to 0 (tolerant of absent/garbage). */
function nonNegInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

/** Tolerant done/total rollup; absent or sparse → a zero rollup. */
function adaptInteriorRollup(value: unknown): InteriorRollup {
  if (!isRec(value)) return { done: 0, total: 0 };
  return { done: nonNegInt(value.done), total: nonNegInt(value.total) };
}

/** Tolerant per-plan summary; absent or sparse → zeros with no derived state. */
function adaptPlanSummary(value: unknown): PlanSummary {
  if (!isRec(value)) {
    return {
      wave_count: 0,
      phase_count: 0,
      step_count: 0,
      done_count: 0,
      plan_state: null,
    };
  }
  return {
    wave_count: nonNegInt(value.wave_count),
    phase_count: nonNegInt(value.phase_count),
    step_count: nonNegInt(value.step_count),
    done_count: nonNegInt(value.done_count),
    plan_state: typeof value.plan_state === "string" ? value.plan_state : null,
  };
}

function adaptInteriorStep(value: unknown): InteriorStep | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  const id = normalizePipelineString(value.id);
  if (nodeId === null || id === undefined) return null;
  const execNodeId = normalizeNodeId(value.exec_node_id);
  return {
    node_id: nodeId,
    id,
    action: normalizePipelineString(value.action),
    done: value.done === true,
    exec_node_id: execNodeId ?? undefined,
  };
}

function adaptInteriorPhase(value: unknown): InteriorPhase | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  const id = normalizePipelineString(value.id);
  if (nodeId === null || id === undefined) return null;
  return {
    node_id: nodeId,
    id,
    heading: normalizePipelineString(value.heading),
    steps: Array.isArray(value.steps)
      ? value.steps
          .map(adaptInteriorStep)
          .filter((step): step is InteriorStep => step !== null)
      : [],
    rollup: adaptInteriorRollup(value.rollup),
  };
}

function adaptInteriorWave(value: unknown): InteriorWave | null {
  if (!isRec(value)) return null;
  const nodeId = normalizeNodeId(value.node_id);
  const id = normalizePipelineString(value.id);
  if (nodeId === null || id === undefined) return null;
  return {
    node_id: nodeId,
    id,
    heading: normalizePipelineString(value.heading),
    phases: Array.isArray(value.phases)
      ? value.phases
          .map(adaptInteriorPhase)
          .filter((phase): phase is InteriorPhase => phase !== null)
      : [],
    rollup: adaptInteriorRollup(value.rollup),
  };
}

/** Default the truncated honesty block: forwarded only when the engine capped the
 *  interior (a real object with the three fields); null/absent stays null. */
function adaptInteriorTruncated(value: unknown): PlanInterior["truncated"] {
  if (
    isRec(value) &&
    typeof value.total_nodes === "number" &&
    typeof value.returned_nodes === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      total_nodes: value.total_nodes,
      returned_nodes: value.returned_nodes,
      reason: value.reason,
    };
  }
  return null;
}

/** Live `/nodes/{id}/plan-interior` → the internal plan-interior response.
 *  TOLERANT: a sparse body defaults waves/phases/steps to empty and truncated to
 *  null, so the Work step-tree renders without guarding for missing keys. */
export function adaptPlanInterior(body: unknown): PlanInteriorResponse {
  const empty: PlanInterior = {
    plan_node_id: "",
    waves: [],
    phases: [],
    steps: [],
    summary: adaptPlanSummary(undefined),
    truncated: null,
  };
  if (!isRec(body)) return { interior: empty, tiers: {} };
  const raw = isRec(body.interior) ? body.interior : body;
  return {
    interior: {
      plan_node_id: normalizeNodeId(raw.plan_node_id) ?? "",
      waves: Array.isArray(raw.waves)
        ? raw.waves
            .map(adaptInteriorWave)
            .filter((wave): wave is InteriorWave => wave !== null)
        : [],
      phases: Array.isArray(raw.phases)
        ? raw.phases
            .map(adaptInteriorPhase)
            .filter((phase): phase is InteriorPhase => phase !== null)
        : [],
      steps: Array.isArray(raw.steps)
        ? raw.steps
            .map(adaptInteriorStep)
            .filter((step): step is InteriorStep => step !== null)
        : [],
      summary: adaptPlanSummary(raw.summary),
      truncated: adaptInteriorTruncated(raw.truncated),
    },
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}
