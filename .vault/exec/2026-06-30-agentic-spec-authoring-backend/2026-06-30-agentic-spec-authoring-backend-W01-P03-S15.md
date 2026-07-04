---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S15'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify frontend and agent fixtures can serialize the same command vocabulary without core-shaped verbs

## Scope

- `engine/crates/vaultspec-api/src/authoring/model.rs`

## Description

- Verify `CommandKind` serializes to semantic snake_case names for frontend and
  agent tool callers.
- Add a full command-list test so every current command variant is checked
  against core-shaped public names.
- Include session, proposal, review, lease, apply, rollback, tool, context,
  search, and stream command vocabulary in the shared enum.

## Outcome

Frontend and LangGraph-facing agent fixtures can consume the same semantic
command vocabulary without exposing `vaultspec-core` or `/ops/core` verbs as the
authoring contract.

## Notes

The test checks every current `CommandKind` variant, not a hand-picked subset.
