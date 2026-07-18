---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-18'
modified: '2026-07-18'
step_id: 'S106'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Run the complete frontend test recipe against the real live-engine harness

## Scope

- `frontend/`

## Description

Ran the complete `frontend/` vitest suite (`npx vitest run`, no filters)
against the real live-engine harness, three times across two sessions.

## Outcome

Every run lands at 3682/3683 or 3679/3683 depending on which prior fix batch
was in place at the time; against the punch-list commit (`c169ad5a98`), two
independent full runs both landed 3682/3683, with the SAME single failure in
both: `authoring.happyPath.live.test.ts`'s "propose → approve → apply →
rollback → history" test (`applied.kind` expected `"ok"`, got `"denied"`).
Confirmed this is resource-contention flakiness, not a regression: the two
full-suite runs that surfaced it were running CONCURRENTLY against the same
live engine (a team-lead backstop run in parallel with mine), racing for the
same authoring-session apply lock; reran the file standalone twice,
independently, with zero concurrent load — 1/1 passed both times. The file is
untouched by the punch-list commit and unrelated to localization.

## Notes

This record was authored during the campaign's one closing cold-verification
pass — no code changes by me.

Independently reverified: two full `frontend/` suite runs against
`c169ad5a98` — 3682/3683 each, identical single flaky failure both times;
`authoring.happyPath.live.test.ts` standalone — 1/1 passed, twice, with zero
concurrent load. The flake is recorded, not swept — carried to `P20`'s review
as an environmental/concurrency-sensitivity note, not a punch-list defect.
