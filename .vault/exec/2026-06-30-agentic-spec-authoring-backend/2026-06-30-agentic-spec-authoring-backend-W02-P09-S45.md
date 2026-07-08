---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S45'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify durable event records commit with product state and survive restart before publication

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`

## Description

- Verify a transaction that rolls back after product-state and outbox writes leaves neither row behind.
- Verify a committed pending event survives `Store::open_at` restart with payload, state, and `latest_seq` intact before publication.
- Verify restart recovery reclaims expired publishing rows without reclaiming terminal published rows.

## Outcome

- Durable event records commit with product state and survive restart before publication.
- Failed transactions do not leave orphaned product state or orphaned outbox rows.
- Published rows remain terminal for local publication state.

## Notes

- No manual recovery or destructive git operation was used.
