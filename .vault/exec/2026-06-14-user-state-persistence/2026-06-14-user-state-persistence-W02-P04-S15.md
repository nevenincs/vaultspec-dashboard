---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S15'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# rewrite validate-scope to accept any selectable vault-bearing worktree in the workspace

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Rewrite `validate_scope` from a frozen single-value comparison into a registry
  resolve: it now calls `get_or_build`, which enumerates the workspace's
  worktrees, requires membership plus a present `.vault`, and returns the warm
  cell — building it on first access.
- Change `validate_scope`'s return type from unit to the resolved
  `Arc<ScopeCell>`, so every caller operates on the per-scope cell instead of a
  single frozen `AppState`.
- Keep the honest 400: an unknown or non-vault-bearing scope still returns a
  `BAD_REQUEST` carrying the tiers block, with the registry's membership-rejection
  reason as the message.
- Point `rag_tiers` at the resolved cell so the tiers reported per request
  reflect that scope's rag discovery and declared status.

## Outcome

Scope validation is now a real retarget: any selectable vault-bearing worktree
in the workspace resolves to its warm cell, while an arbitrary path 400s
honestly. The launch worktree resolves on the warm fast path; a sibling worktree
builds its cell on first access. The migrated scope-validation test passes.

## Notes

