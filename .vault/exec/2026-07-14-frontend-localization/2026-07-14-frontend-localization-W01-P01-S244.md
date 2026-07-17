---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S244'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Create bounded non-shipped alternate-locale resources for real locale-reactivity tests

## Scope

- `frontend/src/localization/testing/`

## Description

- Add compact left-to-right and right-to-left catalogs with the source catalog's namespace shape.
- Add a real synchronously initialized runtime for locale-reactivity tests.
- Keep alternate resources outside the shipped locale registry and production import graph.
- Verify interpolation, fallback, locale changes, and direction with the real localization runtime.

## Outcome

Tests can now use two bounded alternate locales without mocks or shipped translation
resources. The fixture supports descriptor interpolation, safe fallback resolution,
React runtime integration, and both writing directions.

## Notes

Prettier, ESLint, TypeScript, and a focused Vitest real-runtime check passed. A source
search confirmed that production modules and build entry points do not import the test
fixture. Step `S07` owns the durable integration tests.
