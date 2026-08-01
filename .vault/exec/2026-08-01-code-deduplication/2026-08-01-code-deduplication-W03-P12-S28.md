---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:4543b76e96c065f0d1e7ef81de187d38fd17c3b6f451a2968829542b9803f238'
step_id: 'S28'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then replace filter write chaining with the keyed serializer

## Scope

- `frontend/src/stores/server/dashboardState*`

## Description

- Replace filter promise-tail maps and queue helper with a direct keyed serializer import.
- Keep fresh cache reads, transforms, and patch construction inside the queued caller task.

## Outcome

Filter writes use a separate canonical serializer instance and retain lost-update protection without duplicate queue code.

## Notes

Focused real dashboard behavior and serializer tests passed with independent Sol review.
