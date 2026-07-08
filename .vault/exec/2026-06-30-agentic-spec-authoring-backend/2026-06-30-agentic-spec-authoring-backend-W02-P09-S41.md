---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S41'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Outbox primitive and sequence allocation requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground W02.P09 against the accepted outbox, authoring store, apply materialization, and LangGraph ADRs.
- Confirm the phase owns only the durable primitive: outbox rows, monotonic sequence identity, publication claim state, restart recovery, and duplicate guards.
- Incorporate the read-only grounding subagent brief into the implementation checklist, including the explicit `dedupe_key`, `AUTOINCREMENT` sequence, and no-route/no-adapter phase boundary.

## Outcome

- The phase scope was narrowed to `store/outbox.rs` plus the store migration in `store/mod.rs`.
- Deferred surfaces remain out of scope: SSE recovery endpoints, LangGraph adapters, publisher workers, frontend projections, token streams, and proposal/session/apply domain tables.

## Notes

- `vaultspec-rag` transport was unavailable, so grounding used targeted local ADR, research, plan, and source reads.
