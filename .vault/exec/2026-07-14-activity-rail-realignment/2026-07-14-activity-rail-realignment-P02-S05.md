---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S05'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace activity-rail-realignment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Derive the framework-status cluster projection - per-chip served health tone and count from the status tiers rollup, useCoreStatus vault health, rag status, and the approvals pending count - raw-selector-plus-useMemo discipline, with unit tests and ## Scope

- `frontend/src/stores/server/queries/frameworkStatus.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Derive the framework-status cluster projection - per-chip served health tone and count from the status tiers rollup, useCoreStatus vault health, rag status, and the approvals pending count - raw-selector-plus-useMemo discipline, with unit tests

## Scope

- `frontend/src/stores/server/queries/frameworkStatus.ts`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Derive the framework-status chip projection: pure `deriveFrameworkStatusView` + `useFrameworkStatusView`, per-panel `{tone, count?, label}`.
- Compose from interpreted selectors only: `useStatusRollup` (backend + core + rag, served degradations rollup), `useRagStatus`, `useReviewStationView`.
- Unit-test tone mapping across ok/attention/down/unknown.

## Outcome

Projection + tests green. Executed by rail-stores-coder; verified independently.

## Notes

Approvals chip emits an exact count ONLY from the untruncated served queue - a truncated queue shows attention with no count (no client re-count over a cap). A served lightweight pending-count route is a filed future ask. The cluster being always-mounted keeps the review-station poll live at rest to feed the badge - flagged for S07/S08 review.
