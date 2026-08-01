---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:32c66915803709358d79cb48c542b53785f927385ec28706ce45e8e6c66e448a'
step_id: 'S33'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add an optional notes field to the permission respond request schema

## Scope

- `src/vaultspec_a2a/api/schemas/gateway.py`

## Description

- Added an optional `notes: str | None = Field(default=None, max_length=2048)` field to `RunPermissionRespondRequest`, bounded consistent with the existing `AnswerText` (clarification) convention.
- Updated the model's docstring to describe how `notes` survives into the verdict resume payload for a locally-respondable pause and is ignored for a plain tool-permission response.
- Regenerated the committed `openapi.json` for this one schema change only (surgical patch, since the live schema also carries unrelated in-flight changes from a concurrent session's work on `clarification.py` that are not mine to commit).

## Outcome

Callers may now optionally attach a reviewer comment to a permission response.

## Notes

`openapi.json`'s full-document parity test (`test_the_committed_artifact_matches_the_live_document_exactly`) still fails after this change, but only on schemas unrelated to this Step (`_ClarificationQuestionSnapshot`, `_ClarificationRequestSnapshot`, `ThreadStateSnapshot`, `RunStatusResponse`) — confirmed by diffing the live schema against the patched committed one and finding the `RunPermissionRespondRequest`/`notes` addition is not among the remaining differences. Pre-existing/concurrent, not introduced here.
