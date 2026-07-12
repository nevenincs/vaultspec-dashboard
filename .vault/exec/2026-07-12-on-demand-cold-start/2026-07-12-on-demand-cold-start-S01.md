---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace on-demand-cold-start with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
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
     The Build useProgressiveGraphSlice: wrap useGraphSlice so a live, cold, document-granularity request serves the same-identity feature-LOD slice as held data (isPending masked) until the document slice lands and ## Scope

- `bypass for asOf`
- `memoized result object`
- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build useProgressiveGraphSlice: wrap useGraphSlice so a live, cold, document-granularity request serves the same-identity feature-LOD slice as held data (isPending masked) until the document slice lands

## Scope

- `bypass for asOf`
- `memoized result object`
- `frontend/src/stores/server/queries.ts`

## Description

Add useProgressiveGraphSlice to `frontend/src/stores/server/queries.ts`: a live, cold, document-granularity request enables the same-identity feature-LOD useGraphSlice and returns its data as the held slice with isPending masked false until the document slice lands; passthrough for feature granularity, time-travel (asOf), and any held/placeholder data; result memoized.

## Outcome

16x smaller cold first paint; the fill is a cache SHARE with the nav descent's constellation (same query key).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
