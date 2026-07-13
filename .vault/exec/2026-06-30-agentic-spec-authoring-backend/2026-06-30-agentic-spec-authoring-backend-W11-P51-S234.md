---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S234'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Frontend stream cursor: swap polling for the authoring lifecycle stream code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Audit the W11.P51 frontend stream cursor against the grounding checklist,
  streaming-events/outbox ADR constraints, and graph stream hardening patterns.
- Review lifecycle handling for invalidation-only behavior, monotonic cursor
  advance, explicit gap recovery, snapshot-plus-next-sequence cache application,
  tiered error handling, retained-frame bounds, and polling removal.
- Identify and fix the multiple-subscription risk by changing the lifecycle loop
  to a module-level, reference-counted subscription shared by all hook consumers.
- Append the W11.P51 review result to the existing rolling feature audit.

## Outcome

S234 review found no remaining open frontend stream cursor issue after the
singleton subscription fix. The audit entry records the fixed risk and the
accepted finite-replay constraint: the frontend reopens `/authoring/v1/events`
from its durable cursor because the backend currently serves finite replay rather
than a held live stream.

## Notes

- Audit updated: `.vault/audit/2026-07-06-agentic-spec-authoring-backend-audit.md`.
- Verification after the review fix:
  - `npx prettier --write src/stores/server/authoring.ts`
  - `npm run typecheck`
  - `npm test -- src/stores/server/authoring.test.ts`
