---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Degrade honestly for a remote-ref scope or absent structural tier while carrying the tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Verify honest degradation: an unknown / non-worktree (remote-ref-style) scope is refused through the shared `validate_scope` path with a tiered 400, and a worktree whose working tree cannot be listed degrades the `structural` tier (via `degraded_tiers_for(cell, "structural", reason)`) with an empty level rather than a healthy-looking populated one or a bare error.
- Confirm a traversal/escape path is treated as a malformed REQUEST (a tiered 400), distinct from degradation, and that every response — success and error — carries the tiers block through the shared envelope.

## Outcome

- Verified: the integration suite asserts an unknown scope 400s with the tiers block, a traversal path 400s with the tiers block, and the structural-degrade path returns an empty level under a `structural` unavailable tier.
- COMMITTED: the degradation logic lives in `routes/file_tree.rs` (P02.S07); the shared `degraded_tiers_for` helper edit lives in the DEFERRED `routes/mod.rs`.

## Notes

- DEFERRED COMMIT: `routes/mod.rs` (which gained the `degraded_tiers_for` per-request single-tier degrade helper, mirroring `query_tiers` / `degraded_tiers`) is entangled with peer edits in the same file and is left uncommitted. The helper is small and additive; it overlays one named tier as unavailable onto the real declared-tier status, so the code mode renders a designed degraded state.
- The remote-ref case is realized as the scope-validation 400: a remote ref has no selectable worktree, so it never resolves to a file-tree, and the honest refusal is the tiered 400. This matches the contract (`/map` marks remote refs `degraded: ["structural"]`).
