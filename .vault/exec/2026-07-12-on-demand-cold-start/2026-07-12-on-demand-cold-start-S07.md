---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S07'
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
     The S07 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
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
     The Add the instant pre-hydration boot shell: an inline-styled static skeleton in index.html painting before any bundle downloads, retired on AppShell's first commit with a main.tsx backstop and ## Scope

- `frontend/index.html + frontend/src/main.tsx + frontend/src/app/AppShell.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the instant pre-hydration boot shell: an inline-styled static skeleton in index.html painting before any bundle downloads, retired on AppShell's first commit with a main.tsx backstop

## Scope

- `frontend/index.html + frontend/src/main.tsx + frontend/src/app/AppShell.tsx`

## Description

Add the pre-hydration boot shell: inline-styled static skeleton in index.html (theme-aware via prefers-color-scheme, reduced-motion safe, literal values mirroring the paper/ink/accent tokens - the sanctioned pre-token pattern), retired by AppShell's first-commit effect with a 10s main.tsx backstop for non-AppShell surfaces.

## Outcome

Live-verified: shell paints at ~50ms (before any bundle), hands off to real chrome at app commit with no blank frame.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
