---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S105'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Verify expanded and right-to-left test locale behavior for layout, focus, rich interpolation, live regions, lang, and dir

## Scope

- `frontend/e2e/localization-layout.spec.ts`
- `frontend/playwright.localization.config.ts`
- `frontend/src/main.tsx`
- `frontend/src/platform/localization/LocalizationProvider.tsx`

## Description

Added a Playwright spec over a dev-only locale-injection lever (a
`LocalizationProvider` instance swap gated on `import.meta.env.DEV`, so it exists
only under the Vite dev server, never in a production build) proving: the harness
lever is present under dev affordances; French (expanded copy, LTR) sets `lang`
and keeps `ltr` direction; Arabic (RTL) sets `lang`, flips `dir`, and mirrors the
computed direction; keyboard focus order still lands the skip link on the stage
under RTL; rich named interpolation resolves in both directions with real values
(no raw tokens); the activity rail's live region keeps a real translated
accessible label under RTL; and resetting the locale restores the source lang,
dir, and English copy.

## Outcome

Expanded-copy and RTL behavior is proven live against a real browser and a real
dev-server-hosted app instance, not a synthetic DOM fixture.

## Notes

Landed at commit `164ea9fc1d` (same commit as `S104`/`S138`). This record was
authored during a fill pass reconciling the team lead's verification request — no
code changes by me.

Independently reverified: live rerun of `localization-layout.spec.ts` under
`playwright.localization.config.ts` (the dev-server config this dev-only lever
requires) — 7/7 passed, matching the claimed count.
