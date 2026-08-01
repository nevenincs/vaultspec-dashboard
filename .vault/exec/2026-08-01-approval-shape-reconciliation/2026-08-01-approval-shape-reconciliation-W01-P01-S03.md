---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:c4d3f941c01203947699215089ffe8ba34202682971cc48831092d8c8c6b8856'
step_id: 'S03'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Drop the origin_author parameter from run_authorization and its CommandAuthorization construction, and remove the trailing None argument from its own call site

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/handlers1.rs`

## Description

- Dropped the `origin_author` parameter from `run_authorization` and the `CommandAuthorization` literal it constructs.
- Removed the trailing `None` argument from `authorize_targets_or_deny`'s own `run_authorization` call site in the same file.
- Corrected the `run_authorization` doc comment to drop the retired review-authority-guard sentence.

## Outcome

Compiles clean; the document-scope guard call shape is unchanged apart from the dropped parameter.

## Notes

None.
