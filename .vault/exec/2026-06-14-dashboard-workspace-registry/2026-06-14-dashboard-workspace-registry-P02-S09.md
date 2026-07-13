---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S09'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Route registry add and forget through the user-state config surface, not the graph API or the ops proxy

## Scope

- `engine/crates/vaultspec-api/src/routes/session.rs`

## Description

- Add `add_workspace` and `forget_workspace` to the PUT `/session` update body, routing both through the user-state config surface, not the read-only graph API and not the `/ops` proxy.
- Add a read-only `register_root` helper: it discovers the operator-supplied path as a git workspace and enumerates its worktrees to validate it, derives the stable id from the canonical git common dir, and records one registry config row; it refuses an invalid path honestly and never partially registers.
- Add a `forget_root` helper: it removes the registry config row, surfaces the last-launch-root refusal as a tiered 400, and evicts any warm scope cells under the forgotten workspace's root subtree.
- Add an `evict_where` predicate eviction to the warm scope registry for the forget path.

## Outcome

Registry add and forget are exposed only through the config surface and are read-only over repository content. A route test registers a real sibling git workspace, asserts the sibling repo's commit count is unchanged (registration never mutated it), lists it, forgets it, and a second test asserts the last-launch-root refusal carries the tiers block.

## Notes

Forget evicts warm cells by root-subtree prefix match (never the pinned active scope); a forget of the active workspace is preceded by the frontend's active re-point, so the pinned scope is re-selected before any eviction.
