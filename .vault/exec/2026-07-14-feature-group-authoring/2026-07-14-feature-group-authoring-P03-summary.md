---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

# `feature-group-authoring` `P03` summary

## Description

P03 delivered the frontend stores seam, executed by a delegated coder and
adversarially reviewed APPROVED (no CRITICAL/HIGH). S07: the feature-coverage
query plane — `useFeatureCoverageView`/`useFeatureRosterView` keyed on
scope+feature with tolerant adapters, degradation read only from the tiers
structural key, enrolled in both the generation sweep and scope-swap
eviction subtrees (guards updated). S08: the create-doc chrome store reworked
to the staged feature-first shape — stage transitions, eligibility
reconciliation (`reconcileCreateDocType`), deterministic editable related
pre-fill (`seedRelatedFromCoverage`, capped 16), exec removed from the
offered types. S09: `related` threaded through the existing create mutation;
a created receipt sweeps coverage via the enrolled subtree. 52 tests green
(16 store + 13 live-wire + 23 enrollment guards); tsc clean whole-frontend.

- Created: `frontend/src/stores/server/queries/features.ts` + test, `frontend/src/stores/server/liveAdapters/features.ts`
- Modified: `frontend/src/stores/view/createDocChrome.ts` + test, `frontend/src/stores/server/queries/{index,internal,mutations}.ts`, `internal.test.ts`, `frontend/src/stores/server/engine/{client,graphTypes}.ts`, `frontend/src/stores/server/liveAdapters/index.ts`
- Modified: `frontend/scripts/module-size-baseline.json` (app.rs +2 for the reviewer-requested comment fix; stale decomposed-module entry ratcheted out)

Review advisories carried into P04's brief: render creation affordances only
from `deriveOfferedCreateDocTypes` (never `coverage.missing`, which honestly
includes exec); gate submit on `isCreateDocTypeEligible` (the submission
derivation deliberately does not self-gate, per the ADR's presentational-
gating decision); the adapter's absent-coverage floor differs from the store
fallback (harmless — the tiers-suppressed view governs — recorded here).
