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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S12 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Publish the platform public API barrel and wire the query client error sink to the policy and ## Scope

- `frontend/src/platform/index.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
