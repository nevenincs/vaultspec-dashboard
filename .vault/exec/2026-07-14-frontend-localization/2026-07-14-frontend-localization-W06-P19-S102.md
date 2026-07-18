---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-18'
modified: '2026-07-18'
step_id: 'S102'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Run catalog, runtime, formatter, descriptor, error-safety, and locale-reactivity suites against production resources

## Scope

- `frontend/src/localization/`
- `frontend/src/platform/localization/`

## Description

Ran the full localization/platform-localization suite against production
resources — catalog completeness, runtime resolution, formatters, message
descriptors, error-safety (`messagePolicy`), and locale-reactivity — live
against the real engine, no mocks.

## Outcome

All 15 test files in scope pass: 91/91 tests green, including the two
previously-red catalog policy checks (`messagePolicy.test.ts`'s
`common:agent.composer.teamRunRefused` and `actionVocabulary.test.ts`'s
`common:agent.composer.teamRunDismiss`), now fixed by the P19 punch list.

## Notes

Fix landed at commit `c169ad5a98` ("P19 cold-boot punch list — Documents-radio
helper, actionable team-run copy, structural scanner exclusion, 21 unmasked
sentence-case fixes"). This record was authored during a fill pass reconciling
the team lead's cold-verification-pass request — no code changes by me.

Independently reverified: live rerun of the full scope
(`frontend/src/localization/`, `frontend/src/platform/localization/`) — 15
files, 91/91 tests passed, matching the punch list's claimed evidence.
