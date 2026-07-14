// Feature-coverage tolerant adapters (feature-group-authoring ADR D2/D3).
//
// Tolerant adapters for `GET /features`. The live `{data: {coverage}, tiers}` /
// `{data: {roster}, tiers}` envelope is already unwrapped by `unwrapEnvelope`
// before this runs (the client's get path flattens `data` and lifts `tiers`); a
// body already in the internal shape passes through unchanged — the one-code-path
// property (mock-mirrors-live-wire-shape). Every missing field defaults to a safe
// value so a sparse or older shape NEVER throws and the chrome never reads the raw
// tiers block (degradation truth rides on `tiers`, defaulted to an empty block when
// absent). Eligibility is served, never recomputed here (ADR D3): a served `types`
// entry's `eligible`/`note` pass through faithfully; a wholly-absent coverage
// (a degraded read) yields an all-missing shape whose per-type eligibility is left
// conservative (nothing eligible past the entry points) rather than reimplementing
// the engine's hierarchy gate.

import {
  PIPELINE_COVERAGE_DOC_TYPES,
  type FeatureCoverage,
  type FeatureCoverageResponse,
  type FeatureRosterEntry,
  type FeatureRosterResponse,
  type FeatureTypeCoverage,
  type TiersBlock,
} from "../engine";
import { isRec } from "./internal";

const EMPTY_TIERS = {} as TiersBlock;

function tiersOf(body: Record<string, unknown>): TiersBlock {
  return isRec(body.tiers) ? (body.tiers as TiersBlock) : EMPTY_TIERS;
}

function strOrUndef(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** One served type-coverage entry → the internal shape, tolerating an absent or
 *  partial object. `eligible` defaults false (conservative: an unparseable entry
 *  is not offered); the served flag is authoritative when present (ADR D3). */
function adaptTypeCoverage(raw: unknown, docType: string): FeatureTypeCoverage {
  const r = isRec(raw) ? raw : {};
  return {
    doc_type: typeof r.doc_type === "string" ? r.doc_type : docType,
    present: r.present === true,
    count: numOr(r.count, 0),
    newest_stem: strOrUndef(r.newest_stem),
    eligible: r.eligible === true,
    note: strOrUndef(r.note),
  };
}

/**
 * Adapt a `/features?feature=` coverage body. The served `types` array (the engine
 * emits all pipeline types, in order) is mapped faithfully; a wholly-absent or
 * malformed coverage synthesizes an all-missing shape for `requestedFeature` so the
 * panel still renders every pipeline slot (nothing eligible past the always-open
 * entry points, matching the degraded read's honest "start a new feature" floor).
 */
export function adaptFeatureCoverage(
  body: unknown,
  requestedFeature: string,
): FeatureCoverageResponse {
  const b = isRec(body) ? body : {};
  const rawCoverage = isRec(b.coverage) ? b.coverage : undefined;
  const tiers = tiersOf(b);
  if (!rawCoverage) {
    return { coverage: allMissingCoverage(requestedFeature), tiers };
  }
  const feature =
    typeof rawCoverage.feature === "string" ? rawCoverage.feature : requestedFeature;
  // Iterate the CANONICAL pipeline order rather than trusting the served array's
  // order/completeness: look each type up in the served `types` (by doc_type) so a
  // sparse array still yields every slot with the served eligibility preserved.
  const servedTypes = Array.isArray(rawCoverage.types) ? rawCoverage.types : [];
  const byDocType = new Map<string, unknown>();
  for (const entry of servedTypes) {
    if (isRec(entry) && typeof entry.doc_type === "string") {
      byDocType.set(entry.doc_type, entry);
    }
  }
  const types: FeatureTypeCoverage[] = PIPELINE_COVERAGE_DOC_TYPES.map((docType) =>
    adaptTypeCoverage(byDocType.get(docType), docType),
  );
  const missing = types.filter((t) => !t.present).map((t) => t.doc_type);
  return {
    coverage: {
      feature,
      types,
      missing,
      next_step: strOrUndef(rawCoverage.next_step),
    },
    tiers,
  };
}

/** The conservative all-missing coverage floor for a degraded/absent read: every
 *  pipeline type absent and ineligible, entry point advised. The engine's own
 *  all-missing state marks research/reference eligible; the adapter stays
 *  conservative (offers nothing) so a degraded read never invites a create it
 *  cannot ground — the panel gates on the served tiers block regardless. */
function allMissingCoverage(feature: string): FeatureCoverage {
  const types: FeatureTypeCoverage[] = PIPELINE_COVERAGE_DOC_TYPES.map((docType) => ({
    doc_type: docType,
    present: false,
    count: 0,
    newest_stem: undefined,
    eligible: false,
    note: undefined,
  }));
  return {
    feature,
    types,
    missing: types.map((t) => t.doc_type),
    next_step: "research",
  };
}

/** Adapt a `/features` roster body, tolerating an absent or partial array. */
export function adaptFeatureRoster(body: unknown): FeatureRosterResponse {
  const b = isRec(body) ? body : {};
  const rawRoster = Array.isArray(b.roster) ? b.roster : [];
  const roster: FeatureRosterEntry[] = rawRoster
    .filter(isRec)
    .filter((entry) => typeof entry.feature === "string")
    .map((entry) => ({
      feature: entry.feature as string,
      doc_count: numOr(entry.doc_count, 0),
      types_present: numOr(entry.types_present, 0),
      next_step: strOrUndef(entry.next_step),
    }));
  return { roster, tiers: tiersOf(b) };
}
