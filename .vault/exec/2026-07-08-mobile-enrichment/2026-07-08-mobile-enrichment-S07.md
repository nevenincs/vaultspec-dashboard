---
tags:
  - '#exec'
  - '#mobile-enrichment'
date: '2026-07-09'
modified: '2026-07-09'
step_id: 'S07'
related:
  - "[[2026-07-08-mobile-enrichment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace mobile-enrichment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-07-08-mobile-enrichment-plan placeholders are machine-filled by
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
     The D6: compact reader breadcrumb legibility — drop the Vault root on compact and keep ancestor crumbs whole so only the title truncates (no more Va… / Decisi… / title…) and ## Scope

- `frontend/src/app/kit/Breadcrumb.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# D6: compact reader breadcrumb legibility — drop the Vault root on compact and keep ancestor crumbs whole so only the title truncates (no more Va… / Decisi… / title…)

## Scope

- `frontend/src/app/kit/Breadcrumb.tsx`

## Description

- Add an `includeRoot` option to `buildDocTrail`; the compact reader passes `false` to drop the low-value "Vault" root, leaving the doc-type / title pair.
- Change the shared `Breadcrumb` so ancestor crumbs stay whole (`shrink-0` / `whitespace-nowrap`) and only the final (title) segment truncates.

## Outcome

The compact reader trail reads "Decisions / <title>" instead of "Va… / Decisi… / title…" (verified live @390px). The wide desktop `DocPanel` trail is unchanged; the `Breadcrumb` render test and the compact guard test stay green.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
