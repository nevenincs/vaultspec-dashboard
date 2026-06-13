---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S12'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---




# Publish the platform public API barrel and wire the query client error sink to the policy

## Scope

- `frontend/src/platform/index.ts`

## Description

- Published `src/platform/index.ts`: the substrate's public interface, re-exporting all
  four pillars (logger + traps + worker bridge, error boundaries + crash injector,
  dispatch seam, failure policy) so the other teams import stable seams from one path.
- Wired the default query client to the policy: a `QueryCache` whose `onError` routes
  every query failure through `queryErrorRouter` (classified and logged once), and a
  retry predicate that honors the taxonomy - retry only `retryable` (transient) kinds
  once, fail fast on degraded/fatal so degradation surfaces render immediately.

## Outcome

The substrate is now consumable as `import { ... } from "../platform"`. A barrel smoke
test asserts all 22 pillar entry points resolve. The query-client change replaced the
blanket `retry: 1` with the policy-driven predicate; the full suite (299 tests) stays
green, so no existing query test relied on retrying non-transient failures.

## Notes

Importing the barrel pulls the React surfaces and instantiates the app singletons
(logger, appDispatcher, failurePolicy); a consumer wanting only the logger can import
the submodule path directly. The queryClient edit is stores -> platform (downward),
which the layer-ownership boundary permits.
