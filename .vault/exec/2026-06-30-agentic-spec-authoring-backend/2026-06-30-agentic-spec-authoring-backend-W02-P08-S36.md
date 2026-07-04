---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S36'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Retention compaction and backup classes requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground retention behavior in the authoring state-store, rollback history,
  streaming/outbox, security provenance, chunk management, and change-format
  ADRs.
- Dispatch a read-only explorer to cross-check retention classes, schema shape,
  test expectations, and phase boundaries.
- Scope W02.P08 as metadata primitives for later authoring records, not as
  future proposal, approval, apply, rollback, outbox, route, or LangGraph tables.

## Outcome

The phase requirements were narrowed to explicit retention classes, protected
record behavior, compaction markers, rollback limitation metadata, backup export
manifests, and status reporting.

## Notes

The explorer confirmed that `protected_product_state`, `rollback_material`,
`audit_receipt`, `review_material`, `generation_transcript`, and
`expiring_idempotency` should be persisted as closed snake-case classes.
