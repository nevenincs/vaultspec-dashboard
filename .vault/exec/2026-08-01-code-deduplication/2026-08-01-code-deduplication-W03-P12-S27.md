---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:a5a328ebb7186a10229a2719ec35420f85fb4cf70d01da22cb4d2d7e6bbeafd5'
step_id: 'S27'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then replace panel write chaining with the keyed serializer

## Scope

- `frontend/src/stores/server/dashboardState*`

## Description

- Replace panel-state promise-tail maps and queue helper with a direct keyed serializer import.
- Keep pending-panel-state ownership local and clear it only when the current serializer tail settles.

## Outcome

Panel writes use their dedicated canonical serializer instance with no local queue mechanism.

## Notes

Focused real dashboard behavior and serializer tests passed with independent Sol review.
