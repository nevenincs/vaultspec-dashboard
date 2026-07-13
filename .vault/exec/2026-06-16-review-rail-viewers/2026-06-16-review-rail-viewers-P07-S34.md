---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S34'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

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
