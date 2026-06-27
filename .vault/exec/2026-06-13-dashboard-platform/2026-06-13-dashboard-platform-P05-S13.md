---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S13'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

# Add the live adverse-condition spec exercising each FailureKind through the boundaries and policy

## Scope

- `frontend/e2e/adverse.spec.ts`

## Description

- Authored `frontend/e2e/adverse.spec.ts`: a Playwright spec driving the running app
  through the substrate's headline guarantee via the dev-only crash injector (a real
  render throw caught by a real region boundary).
- Added `playwright.adverse.config.ts`: runs against the Vite dev server with the mock
  engine (the dev affordances only exist when `import.meta.env.DEV` is true, so a prod
  `vaultspec serve` build cannot host the spec), using Playwright's bundled chromium.
- Excluded the spec from the live-origin `playwright.config.ts` (`testIgnore`) and added
  stable `data-crash` / `data-crash-clear` / `data-crash-injector` hooks to the injector.

## Outcome

4 live tests pass against the running dev server in chromium: the app boots under the
mock engine with the four-region shell and dev affordances; a thrown stage is contained
to its region while the timeline sibling stays live and the app-level boundary never
fires (no white screen); the region recovers on clear + retry; and a right-rail crash
leaves the timeline and stage regions alive. This is the live adverse-condition proof
the degradation thesis required.

## Notes

The webServer initially timed out because Vite's default `localhost` bind can resolve to
`::1` while Playwright polls `127.0.0.1`; fixed by passing `--host 127.0.0.1` to the dev
command. The degraded-state and stream-loss conditions are additionally covered by the
unit tests for the failure policy, the degradation matrix, and the global traps; this
spec focuses on the integrated boundary-containment guarantee end to end.
