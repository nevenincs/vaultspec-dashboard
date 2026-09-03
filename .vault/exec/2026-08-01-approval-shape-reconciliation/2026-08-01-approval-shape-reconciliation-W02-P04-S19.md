---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:a964a2c0285efa1336c3377a58b7759b2a39e41bad475f31016ad963be488ca4'
step_id: 'S19'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add reviewer approval descriptor entries to POLICY_DESCRIPTORS for all three modes and repoint the manual human approval entry at the destructive floor wording

## Scope

- `frontend/src/stores/server/authoring/reviewStationVocabulary.ts`

## Description

- Add `reviewer_approval_required` descriptor entries to `POLICY_DESCRIPTORS` for all three operation modes, satisfying the exhaustive `Record<OperationMode, Record<ApprovalRequirement, MessageDescriptor>>` type; only the `manual` entry is ever actually served by the engine matrix (destructive risk always yields `human_approval_required` regardless of mode; non-destructive risk yields `reviewer_approval_required` only under `manual`).
- Repoint the `manual` mode's `human_approval_required` entry at a new destructive-floor-specific key instead of continuing to share the generic "reviewer approval" wording that now belongs to the new token — the `manual` mode was the one place `human_approval_required` was previously overloaded across both the destructive floor and the general non-destructive manual gate; `assisted`/`autonomous`'s `human_approval_required` already denoted the destructive floor exclusively (both before and after this ADR), so their copy is unchanged.

## Outcome

`POLICY_DESCRIPTORS` is a complete 3x3 matrix over mode and requirement. The `manual.human_approval_required` entry now points at `documents:reviewStation.policy.manualHumanApproval` carrying destructive-floor wording; a new `documents:reviewStation.policy.manualReviewerApproval` key carries the freed-up "reviewer approval" wording for `manual.reviewer_approval_required`.

## Notes
