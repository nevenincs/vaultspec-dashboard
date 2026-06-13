---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S04'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Implement the ErrorBoundary class with app and region variants, reset, and the logger hook and ## Scope

- `frontend/src/platform/errors/ErrorBoundary.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the ErrorBoundary class with app and region variants, reset, and the logger hook

## Scope

- `frontend/src/platform/errors/ErrorBoundary.tsx`

## Description

- Implemented the `ErrorBoundary` class (the substrate's one class component) using
  `getDerivedStateFromError` and `componentDidCatch`.
- `componentDidCatch` logs through `logger.child("boundary")` plus a debug record
  carrying the React component stack, then calls the optional `onError` hook.
- Added a `variant` prop ("app" full-screen last line, "region" contained card) and a
  `fallback` override; `reset()` clears the boundary so children re-mount on retry.
- Authored `DefaultFallback`: the app variant is a full-screen recoverable message; the
  region variant is a compact amber card in the degradation palette; the raw error
  message renders only in development.

## Outcome

6 tests cover healthy passthrough, region containment plus logging, the app fallback, a
custom fallback, retry recovery, and sibling isolation (a thrown stage does not take
down the rail). `children` was made optional to satisfy `createElement` variadic-child
typing across the test suite.

## Notes

Mechanism only (ADR D1/D4): the boundary catches *unexpected* throws; expected
degradations stay with the app degradation matrix. No scaffolds left.
