// Feature-coverage stores query (feature-group-authoring ADR D2/D3).
// Domain submodule of the queries barrel; see ./index.ts.
//
// The feature-group panel's read seam: per-feature pipeline coverage (present/
// missing types with newest stems, per-type served eligibility, next-step token)
// and the compact all-features roster, each keyed on the per-workspace scope. The
// panel is app chrome under dashboard-layer-ownership: it consumes these hooks +
// the tiers-reading view ONLY, never fetching the engine and never inspecting the
// raw `tiers` block. Degradation is read from the served tiers block (success data
// OR a FRESH error envelope's tiers winning over a stale held block), never guessed
// from a bare transport error (degradation-is-read-from-tiers). Coverage is a
// projection over the one model (views-are-projections-of-one-model); eligibility
// is engine-served, never client-recomputed (ADR D3).

import {
  engineClient,
  readTierAvailability,
  tiersFromQuery,
  type FeatureCoverage,
  type FeatureRosterEntry,
  type TierAvailability,
  type TiersBlock,
} from "../engine";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { normalizeGraphSliceScope } from "./graph";
import { engineKeys } from "./internal";

/** The feature-coverage projection is resolved by the engine's STRUCTURAL read of
 *  the vault corpus (like the pipeline/filters projections), so the `structural`
 *  tier gates availability (contract §2). */
const FEATURE_COVERAGE_TIERS = ["structural"] as const;

/** Bound the requested feature tag folded into the cache key — a corpus feature
 *  tag is short; an over-long draft string is not a real feature and would bloat
 *  the key. Mirrors the draft-text bound the chrome store enforces. */
export const FEATURE_TAG_KEY_MAX_CHARS = 512;

export interface FeatureCoverageRequestIdentity {
  scope: string | null;
  /** The trimmed, bounded feature tag; null when absent/blank (query disabled). */
  feature: string | null;
}

export function normalizeFeatureCoverageRequestIdentity(
  scope: unknown,
  feature: unknown,
): FeatureCoverageRequestIdentity {
  const normalizedFeature =
    typeof feature === "string" && feature.trim().length > 0
      ? feature.trim().slice(0, FEATURE_TAG_KEY_MAX_CHARS)
      : null;
  return {
    scope: normalizeGraphSliceScope(scope),
    feature: normalizedFeature,
  };
}

/**
 * Per-feature pipeline coverage for the feature-group panel. Disabled until BOTH a
 * scope resolves and a feature is chosen (`feature === null` means the panel has no
 * feature selected yet), following the `usePlanInterior` enabled-on-id pattern so
 * the read fires only when there is a group to describe. `keepPreviousData` keeps
 * the prior feature's coverage on screen while the next feature's read is in flight
 * (smoothness, mirroring the graph slice), and the generation-swept `features`
 * subtree refetches on a create receipt so a just-created document surfaces.
 */
export function useFeatureCoverage(scope: unknown, feature: unknown) {
  const request = normalizeFeatureCoverageRequestIdentity(scope, feature);
  const enabled = request.scope !== null && request.feature !== null;
  const query = useQuery({
    queryKey: engineKeys.featureCoverage(request.scope ?? "", request.feature ?? ""),
    queryFn: () => engineClient.features(request.scope!, request.feature!),
    enabled,
    placeholderData: keepPreviousData,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * The compact all-features roster for the panel's feature combobox. Disabled until
 * a scope resolves, mirroring `useFiltersVocabulary`.
 */
export function useFeatureRoster(scope: unknown) {
  const normalizedScope = normalizeGraphSliceScope(scope);
  const enabled = normalizedScope !== null;
  const query = useQuery({
    queryKey: engineKeys.featureRoster(normalizedScope ?? ""),
    queryFn: () => engineClient.featureRoster(normalizedScope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * The interpreted feature-coverage view the panel renders. `loading` is the
 * enabled query's in-flight state; degradation is read from the served `tiers`
 * block (the `structural` tier the coverage projection resolves through), never
 * guessed. While degraded the served coverage cannot be trusted, so `coverage` is
 * left undefined and the panel renders its degraded state rather than a stale or
 * conservative floor as if it were current truth.
 */
export interface FeatureCoverageView extends TierAvailability {
  /** The enabled coverage query is in flight with no held data. */
  loading: boolean;
  /** The served coverage, or undefined while awaiting scope/feature, loading, or
   *  degraded (a degraded read is not rendered as current coverage). */
  coverage: FeatureCoverage | undefined;
  /** The advised next pipeline link to close, when the group carries one. */
  nextStep: string | undefined;
}

export function deriveFeatureCoverageView(
  tiers: TiersBlock | undefined,
  coverage: FeatureCoverage | undefined,
  loading: boolean,
): FeatureCoverageView {
  const availability = readTierAvailability(tiers, FEATURE_COVERAGE_TIERS);
  const trusted = availability.degraded ? undefined : coverage;
  return {
    ...availability,
    loading,
    coverage: trusted,
    nextStep: trusted?.next_step,
  };
}

/**
 * Stores hook: the interpreted feature-coverage view for a scope + feature. Reads
 * tiers from the success envelope, then the `EngineError` envelope (the FRESH error
 * winning over a stale held block), so the panel consumes interpreted truth and
 * never the raw tiers block.
 */
export function useFeatureCoverageView(
  scope: unknown,
  feature: unknown,
): FeatureCoverageView {
  const request = normalizeFeatureCoverageRequestIdentity(scope, feature);
  const query = useFeatureCoverage(request.scope, request.feature);
  const loading = request.scope !== null && request.feature !== null && query.isPending;
  const tiers = tiersFromQuery(query);
  const coverage = query.data?.coverage;
  return useMemo(
    () => deriveFeatureCoverageView(tiers, coverage, loading),
    [tiers, coverage, loading],
  );
}

/**
 * The interpreted roster view: the served entries plus loading/degradation, so the
 * panel combobox reads one interpreted shape. A degraded roster is left empty (the
 * combobox falls back to the corpus feature-tag vocabulary the editor already
 * reads) rather than rendered as current.
 */
export interface FeatureRosterView extends TierAvailability {
  loading: boolean;
  roster: FeatureRosterEntry[];
}

export function deriveFeatureRosterView(
  tiers: TiersBlock | undefined,
  roster: FeatureRosterEntry[],
  loading: boolean,
): FeatureRosterView {
  const availability = readTierAvailability(tiers, FEATURE_COVERAGE_TIERS);
  return {
    ...availability,
    loading,
    roster: availability.degraded ? [] : roster,
  };
}

export function useFeatureRosterView(scope: unknown): FeatureRosterView {
  const normalizedScope = normalizeGraphSliceScope(scope);
  const query = useFeatureRoster(normalizedScope);
  const loading = normalizedScope !== null && query.isPending;
  const tiers = tiersFromQuery(query);
  const roster = query.data?.roster ?? [];
  return useMemo(
    () => deriveFeatureRosterView(tiers, roster, loading),
    [tiers, roster, loading],
  );
}
