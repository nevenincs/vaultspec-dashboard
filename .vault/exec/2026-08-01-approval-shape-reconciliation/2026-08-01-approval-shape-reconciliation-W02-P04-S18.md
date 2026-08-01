---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b86b7fcb858bc63c62f9fda483923bb9af2eab5c8fdb87f879f4799ab2557ac0'
step_id: 'S18'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Widen the ApprovalRequirement union to include reviewer_approval_required

## Scope

- `frontend/src/stores/server/authoring/wireTypes.ts`

## Description

- Widen the served `ApprovalRequirement` union type from `"human_approval_required" | "system_auto_approvable"` to add `"reviewer_approval_required"`, matching the engine's three-way `ApprovalRequirement` enum (ADR D1).
- Document the new token's meaning inline: `human_approval_required` is now the destructive floor only, enforced in every mode; `reviewer_approval_required` is the `manual`-mode non-destructive case.

## Outcome

`ApprovalRequirement` carries the new `reviewer_approval_required` member. No consumer performs an exhaustive switch over the union (the adapter casts the served string directly), so widening the type introduced no compile break outside the intentionally-updated vocabulary/test files.

## Notes
