---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:24c0c32cd4b9014efddf667d4d640c32b6d65ff17ad02e7be45e86b74022a5dd'
step_id: 'S22'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then migrate the agent client to the direct HTTP transport owner

## Scope

- `frontend/src/stores/server/agent/index*`

## Description

- Delete agent-local bearer and non-success conversion implementations.
- Preserve actor-token layering and command envelopes locally.

## Outcome

The agent client imports the canonical stores transport directly with no forwarding layer.

## Notes

Validated with the shared all-client transport suite and independent Sol review.
