---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:9cddddf63f9cbc51816c82651574d15bac18a39b619a9e9a13b593942ffc3965'
step_id: 'S23'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then migrate the A2A team client when its exact scope is free

## Scope

- `frontend/src/stores/server/agent/a2aTeam*`

## Description

- Delete the A2A-local bearer transport and route non-success responses through the canonical converter before JSON success parsing.
- Preserve A2A pass-through, retry, and business-refusal policy locally.

## Outcome

A2A imports the canonical stores transport directly; malformed non-success bodies now remain status-bearing engine errors rather than parse faults.

## Notes

The exact scope was clean. Validated with the shared all-client transport suite and independent Sol review.
