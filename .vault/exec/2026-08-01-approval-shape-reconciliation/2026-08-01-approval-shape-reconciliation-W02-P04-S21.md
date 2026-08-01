---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:73670a5811bce145d839476af8700fe3c954b80afa9e6ed078db0b83fa7ae571'
step_id: 'S21'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Extend the exhaustive ApprovalRequirement coverage test to include the new reviewer approval required token

## Scope

- `frontend/src/stores/server/authoring/reviewStationVocabulary.test.ts`

## Description

- Add `"reviewer_approval_required"` to the `requirements` fixture array in `reviewStationVocabulary.test.ts`, alongside the exhaustive `ApprovalRequirement` coverage loop over all three modes.
- Update the unique-descriptor-key assertion from 6 to 9 (3 modes x 3 requirements, every combo resolving a distinct catalog key).

## Outcome

The exhaustive coverage test iterates all 9 mode/requirement combinations and asserts 9 distinct, fully-translated descriptor keys with no fallback. `npx vitest run src/stores/server/authoring/reviewStationVocabulary.test.ts` passes (10/10); `npx eslint` is clean on every file this Phase touched. `npx tsc --noEmit` shows no NEW errors attributable to this Phase's files — the pre-existing errors it reports (`ControlPanels`, `FrameworkStatusCluster`, `controlPanels` store, etc.) belong to other concurrently in-flight lanes in this shared tree, unrelated to `ApprovalRequirement`/policy vocabulary.

## Notes
