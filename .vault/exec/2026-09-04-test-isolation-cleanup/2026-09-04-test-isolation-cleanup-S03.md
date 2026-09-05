---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:81944db690af654cd507841f03487b7e378b86925d0b5d8527554b3c71386577'
step_id: 'S03'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Run the full frontend suite with the barrier active and enumerate every newly failing suite

## Scope

- `frontend`

## Changes

- `verify:` `just test frontend` -> `fail`

## Notes

One suite failed out of 500: `frontend/src/stores/server/comments.live.test.ts`,
the ledgered plan-step tick, on a 15000ms test timeout. It renders no component,
so the barrier is not on its failure path. Triage is `S04`.
