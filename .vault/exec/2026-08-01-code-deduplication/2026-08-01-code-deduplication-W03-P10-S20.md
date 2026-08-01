---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:0730678430062911dc6bd63116a445bc514a49f1b3f6b4970728a0ed2b73b5c8'
step_id: 'S20'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then migrate the engine client to the direct HTTP transport owner

## Scope

- `frontend/src/stores/server/engine/client*`

## Description

- Replace the client-local machine bearer and error conversion with direct `httpTransport` imports.
- Move direct test and harness type imports to the concrete owner.

## Outcome

The engine client uses the canonical transport and error conversion with no compatibility re-export.

## Notes

Validated with the shared all-client transport suite and independent Sol review.
