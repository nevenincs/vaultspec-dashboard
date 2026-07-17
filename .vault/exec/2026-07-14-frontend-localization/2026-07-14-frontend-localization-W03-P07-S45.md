---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S45'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate global chrome render tests through production catalogs and safe error fallbacks

## Scope

- `frontend/src/app/kit/*.test.tsx`
- `frontend/src/platform/errors/*.test.tsx`

## Description

- Ran the full glob live; every file passed except `ProgressBar.render.test.tsx`,
  which asserted `screen.getByText("3/10")` against a readout the bulk localization
  migration had already restructured into three sibling DOM nodes (value, a
  `DecorativeGlyph` slash separator, max) — an honest gap left by commit
  `3562d0262a`, not a new regression.
- The coding lane (opus-l10n) rewrote the assertion to query the `[data-tabular]`
  container and assert its composed `textContent`, which is derived from the
  component's own rendered structure rather than copied output, and removed the
  now-unused `screen` import.
- Re-ran the full glob live after the fix; independently confirmed all files green.
- Confirmed no test file mocks or stubs the localization runtime or a safe error
  fallback.

## Outcome

Every global chrome and error-boundary render test exercises production locale
resources; the one test the bulk migration had left red now asserts the DOM shape the
localized component actually renders.

## Notes

FINDING: the bulk migration commit `3562d0262a` left `ProgressBar.render.test.tsx` red
— it never updated the test when it introduced the `DecorativeGlyph` slash separator.
This step's completion had been silently blocked since that commit landed; it is worth
surfacing in the closing audit as evidence that the bulk migration was not
100% test-verified at landing time. Fixed and independently reverified in this
reconciliation pass (2026-07-17); not a fresh implementation on my part — the fix and
gate runs are opus-l10n's, spot-checked and reproduced by me (`vitest run` on the full
glob, both files' `git diff` inspected).
