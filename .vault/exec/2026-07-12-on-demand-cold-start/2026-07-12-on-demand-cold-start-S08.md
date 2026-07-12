---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S08'
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
     The S08 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
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
     The Stop pinning lazily-imported registries into the eager vendor chunk: exempt the shiki grammar/theme modules so they emit as natural async chunks, and isolate the three.js scene stack as its own cacheable vendor-scene chunk and ## Scope

- `frontend/vite.config.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Stop pinning lazily-imported registries into the eager vendor chunk: exempt the shiki grammar/theme modules so they emit as natural async chunks, and isolate the three.js scene stack as its own cacheable vendor-scene chunk

## Scope

- `frontend/vite.config.ts`

## Description

Fix the chunk strategy in vite.config.ts: exempt /@shikijs/ from the vendor catch-all so the grammar registry emits as natural per-language async chunks (loaded on first highlight of that language), and split three.js into its own vendor-scene chunk.

## Outcome

Eager JS drops 9.7MB/1.85MB-gzip -> ~2.2MB/~620KB-gzip (vendor 8,645KB -> 630KB). Grammar chunks now load on demand; vendor-scene (505KB) is isolated + cacheable, with its full deferral blocked on the sceneController->cameraCore three import (documented follow-up).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
