---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:1821815edcf4fae520f62ebf3945f9f4c465b41bd4c9f59c7d93114723fba830'
step_id: 'S02'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Delete the now-orphaned reviewer_eligibility wrapper and its unit test since its only caller was the deleted review-authority clause

## Scope

- `engine/crates/vaultspec-api/src/authoring/policy.rs`

## Description

- Deleted the `reviewer_eligibility` wrapper function, orphaned once S01 removed its only caller (`security::authorize_command`'s review-authority clause).
- Deleted its unit test `reviewer_eligibility_refuses_agent_self_approval_but_permits_human_and_distinct`.
- Removed the now-unused `automated_self_approval_blocker` import (its only use in this file was inside the deleted wrapper).

## Outcome

`authoring::policy` unit tests: 9/9 passing (one fewer than before, the removed test). The reused self-approval authority (`approvals::automated_self_approval_blocker`) is untouched; only the dead second wrapper is gone.

## Notes

None.
