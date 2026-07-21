---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S94'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S94 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove status interpretation, cold readiness, foreign immutability, job settlement, query invalidation, and bounded polling from production store functions and ## Scope

- `frontend/src/stores/server/a2aLifecycle.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove status interpretation, cold readiness, foreign immutability, job settlement, query invalidation, and bounded polling from production store functions

## Scope

- `frontend/src/stores/server/a2aLifecycle.test.ts`

## Description

- Added `a2aLifecycle.test.ts` proving `deriveA2aLifecycleView` interpretation from spec-derived inputs: absent (install-only), cold-worker gateway-ready (still service-ready, process control offered), installed-stopped (start not stop), foreign-immutable (unavailable read from tiers.agent), recovery-required (degraded, repair+doctor only), busy (doctor only), and the unread/unknown state.
- Added live-wire hook tests: `useA2aLifecycleStatus` reads a conformant projection carrying the agent tier; a doctor run polls to a terminal state through `useA2aLifecycleJob`, polling stops (fetchStatus idle), and the settlement invalidates the mounted status query (dataUpdatedAt advances).

## Outcome

Nine tests green. Expected values are derived strictly from the ADR state model, never copied from run output. The bounded-polling, job-settlement, and query-invalidation semantics are proven from the production store functions against the real engine.

## Notes

Initial live test had a waitFor that resolved while the job query data was still undefined (`undefined !== "running"`); tightened the predicate to require a defined, terminal state.
