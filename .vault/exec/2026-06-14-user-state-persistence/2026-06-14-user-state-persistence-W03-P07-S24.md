---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S24'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# add a registry scope-switch and per-scope resume integration test

## Scope

- `engine/tests/tests/e2e.rs`

## Description

- Added a `switching_active_scope_serves_that_worktree_and_resumes_its_own_clock` e2e test over the existing two-worktree landscape fixture (main plus a feature worktree whose plan diverges with a branch-only `src/new.rs` mention).
- Asserted the launch worktree is the active scope at boot, and main's graph carries no `src/new.rs` edge.
- Switched the active scope to the feature worktree through `PUT /session` `active_scope`, asserted the session now names the feature worktree.
- Asserted the feature scope's graph DOES carry the branch-only `src/new.rs` mention as a broken structural edge, proving the read was genuinely retargeted to that worktree's bytes.
- Added an `http_stream_capture` helper that connects to `/stream`, sends the request, and reads the SSE resume backlog within a bounded window.
- Asserted per-scope SSE `since=0` resume against the feature scope replays that cell's own monotonic-ascending delta ids, and that the main scope independently replays its own non-empty backlog — proving the two scopes never share a seq space.

## Outcome

The test passes: `cargo test -p engine-e2e --test e2e switching_active_scope` is green. The scope switch retargets reads to the correct worktree and per-scope `since=` resume is correct against each scope's own clock. No mocks, no skips; every assertion derives from the fixture's known divergence and the contract.

## Notes

- The divergent mention `src/new.rs` does not exist on disk, so it surfaces as a BROKEN structural edge (`dst: code:src/new.rs`) rather than a code node; the assertion checks the edge `dst`, which is the genuine per-scope divergence signal.
- The fixture worktrees have no `.vaultspec` dir, so the declared tier is truthfully unavailable; the structural graph (the divergence under test) is unaffected.
