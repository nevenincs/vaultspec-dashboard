---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S05'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-job-dashboard with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Create the bounded useRagLogs stores hook - lines cap, job filter, poll only while consumed, tiers-gated offline truth - with live-wire tests and ## Scope

- `frontend/src/stores/server/ragControl.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Create the bounded useRagLogs stores hook - lines cap, job filter, poll only while consumed, tiers-gated offline truth - with live-wire tests

## Scope

- `frontend/src/stores/server/ragControl.ts`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Create the bounded `useRagLogs` hook: lines clamp at the client boundary, optional job filter, steady 5s poll only while enabled (the panel-open gate), tiers-gated offline truth, no accumulation beyond the last served envelope.
- Parse the RAW pre-formatted log strings the envelope carries (`{lines: string[], total, filters}`) into `RagLogLine[]` - level + timestamp extracted when present, unstructured lines untoned - with rows/line-length defence caps.
- Live-wire + pure tests per the ragControl conventions.

## Outcome

Green (71 tests across the plane). Executed by rag-stores-coder; verified independently.

## Notes

CONTRACT AMENDMENT (orchestrator decision): the ADR said max 1000 lines, but the engine broker clamps at 500 - the client max and the lines selector were aligned DOWN to 500 (never offer a choice the broker under-delivers); the ADR constraint is amended in place rather than bumping the engine bound during a foreign engine lane.
