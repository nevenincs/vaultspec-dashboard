---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b55fc0be2efc3a7fc7757fc5c05007669d34aaf67cb399ed87d01d62e2d97068'
step_id: 'S21'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then migrate the authoring client to the direct HTTP transport owner

## Scope

- `frontend/src/stores/server/authoring*`

## Description

- Delete authoring-local bearer and non-success conversion implementations.
- Preserve actor-token layering as caller policy over the canonical machine bearer.

## Outcome

Authoring imports the stores transport directly and retains its domain-specific command policy.

## Notes

Validated with the shared all-client transport suite and independent Sol review.
