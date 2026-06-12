---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S37'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement cursor pagination and the per-tier degradation block carried on every response envelope

## Scope

- `engine/crates/engine-query/src/envelope.rs`

## Description

- Implement cursor pagination over id-ordered listings (cursor = last id, exclusive) with a no-gaps-no-overlap walk test.
- Implement the per-tier degradation block builder (all four tiers always stated; unavailable tiers carry reasons) and the `Envelope` carrying data + tiers + optional next cursor.

## Outcome

Contract section 2 cross-cutting guarantees: anything unbounded paginates; every response states tier availability truthfully - absence is data, never an error.

## Notes

None.
