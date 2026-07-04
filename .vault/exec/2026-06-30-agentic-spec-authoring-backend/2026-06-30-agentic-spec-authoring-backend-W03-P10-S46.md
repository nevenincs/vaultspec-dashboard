---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S46'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Document reference resolver requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground the resolver boundary against the document identity, authoring boundary, API contract, and change-format ADRs.
- Confirm the resolver must emit existing, provisional-create, rename-target, and materialized-result document references without exposing `vaultspec-core`.
- Confirm exact path lookup is the only duplicate-stem escape hatch and that provisional create collisions use the shared `doc:<stem>` namespace.
- Confirm ref-scope reads must use committed tree/blob state rather than dirty worktree bytes.

## Outcome

- W03.P10 implementation requirements were grounded before code edits.
- The phase stayed route-independent and did not add apply, materialization, LangGraph, or frontend wiring.

## Notes

- No destructive git operation was used.
