---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S34'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S34 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add component tests for frontmatter rendering, wiki-link navigation, GFM task lists, and code highlighting across light, dark, and high-contrast themes and ## Scope

- `frontend/src/app/viewer/MarkdownReader.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add component tests for frontmatter rendering, wiki-link navigation, GFM task lists, and code highlighting across light, dark, and high-contrast themes

## Scope

- `frontend/src/app/viewer/MarkdownReader.test.tsx`

## Description

- Add MarkdownReader component tests for frontmatter rendering (tags pills, date stamps, clickable related links), in-body wiki-link navigation, GFM task-list checkboxes (the plan step structure), and the tiers-derived states.
- Add highlighterTheme tests proving code highlighting across light, dark, and high-contrast: the token-bound theme emits the same `var(--color-*)` foregrounds under every theme (one theme object, no per-theme stylesheet), and the three `[data-theme]` blocks in styles.css define distinct values for the syntax-bound tokens — the three token maps the ADR requires.
- Add CodeViewer tests for the path header, line numbers, display-only (no textbox), the truncated notice, and the degraded/loading/error states.

## Outcome

19 viewer tests pass, covering frontmatter, wiki-link nav, GFM task lists, code highlighting across the three themes, and the read-only viewer states.

## Notes

The "across themes" property is proven structurally (one theme object emitting token references + three distinct token maps) rather than via happy-dom getComputedStyle, which does not fully resolve the var() + @theme chain — the same scene-seam limitation the theme rule documents.
