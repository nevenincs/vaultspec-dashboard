---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S07'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Add the feature-coverage stores query keyed on scope+feature with tolerant live-adapter parsing and honest degradation from tiers and ## Scope

- `frontend/src/stores/server/queries` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
