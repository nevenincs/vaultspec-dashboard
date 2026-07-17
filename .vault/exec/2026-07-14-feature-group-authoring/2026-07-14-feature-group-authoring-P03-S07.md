---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S07'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

# Add the feature-coverage stores query keyed on scope+feature with tolerant live-adapter parsing and honest degradation from tiers

## Scope

- `frontend/src/stores/server/queries`

## Description

- Add the feature-coverage wire types (`FeatureTypeCoverage`, `FeatureCoverage`, `FeatureRosterEntry`, and the two unwrapped response shapes) plus the canonical `PIPELINE_COVERAGE_DOC_TYPES` order to the engine type module, mirroring the served projection.
- Add tolerant adapters `adaptFeatureCoverage` and `adaptFeatureRoster` in a new live-adapter submodule: iterate the canonical pipeline order, preserve served per-type eligibility faithfully (never recompute the hierarchy gate), synthesize an all-missing floor for an absent/malformed coverage, and drop malformed roster entries.
- Add the `features(scope, feature)` and `featureRoster(scope)` client methods over `GET /features`, wired through the shared unwrap/adapt path.
- Add the `featureCoverage(scope, feature)` and `featureRoster(scope)` cache keys under one `features` family, fenced by a `coverage`/`roster` kind segment.
- Add the `useFeatureCoverage`/`useFeatureRoster` hooks (enabled-gated, coverage carrying `keepPreviousData`) and the tiers-reading `useFeatureCoverageView`/`useFeatureRosterView` views deriving degradation only from the structural tier.
- Enroll the `features` family in both the scope-swap eviction list and the generation-refresh sweep, and update the two enrollment guard tests to include the family.

## Outcome

- Coverage and roster read through one tolerant seam keyed on the per-workspace scope; a degraded structural tier suppresses served coverage rather than rendering a stale or conservative floor as current.
- Unit tests cover the adapters (full, sparse, absent, roster) and the degradation derivations; live-wire tests hit the real `/features` route, confirming an unknown feature serves all-missing coverage (never a 404) with served eligibility and that the roster resolves for a healthy scope.

## Notes

- The live harness runs against the freshest prebuilt engine binary and does not auto-build, so the debug `vaultspec` binary was rebuilt to pick up the `/features` route before the live tests could exercise it.
- Adapters are exported from the live-adapters barrel, not the engine barrel; the adapter unit tests import them from there.
