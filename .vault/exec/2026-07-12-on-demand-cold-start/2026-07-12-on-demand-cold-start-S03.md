---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S03'
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
     The S03 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
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
     The Yield briefly between vault-tree continuation pages so the background drain never contends with first paint or first interaction and ## Scope

- `frontend/src/stores/server/engine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Yield briefly between vault-tree continuation pages so the background drain never contends with first paint or first interaction

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

Add a bounded 120ms drainYield between vault-tree continuation pages in `frontend/src/stores/server/engine.ts` (after onPartial, never after the final page), so the background drain never contends with first paint.

## Outcome

Worst-case added latency ~3s at the 26-page cap; the fixture vault (single small first page) sees zero added test time.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
