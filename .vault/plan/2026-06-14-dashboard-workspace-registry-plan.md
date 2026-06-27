---
tags:
  - '#plan'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-22'
tier: L2
related:
  - '[[2026-06-14-dashboard-workspace-registry-adr]]'
  - '[[2026-06-14-dashboard-left-rail-research]]'
---

# `dashboard-workspace-registry` plan

### Phase `P01` - Backend registry and persistence

Persist the workspace registry in the vaultspec-session orchestration crate: an ordered set of project roots (stable id from the git common dir, label, reachability), auto-registering the launch workspace, stored best-effort in user-state.sqlite3. Read-only: registering never mutates a repository.

- [x] `P01.S01` - Define the WorkspaceRoot record and registry schema (stable id from git common dir, label, path, reachability); `engine/crates/vaultspec-session/src/schema.rs`.
- [x] `P01.S02` - Implement the durable workspace-registry table with best-effort open-or-heal in the user-state store; `engine/crates/vaultspec-session/src/store.rs`.
- [x] `P01.S03` - Auto-register the launch workspace as the first root on first run; `engine/crates/vaultspec-session/src/lib.rs`.
- [x] `P01.S04` - Implement read-only add, forget, and select-active registry operations that never mutate a repository; `engine/crates/vaultspec-session/src/session.rs`.
- [x] `P01.S05` - Roundtrip-test registry persistence and corrupt-store recreation; `engine/crates/vaultspec-session/tests/`.

### Phase `P02` - Wire surface

Expose the registry on the wire: GET /workspaces, an optional workspace= parameter on /map (default active, single-workspace behaviour unchanged), and an active_workspace field on /session. Registry add/forget route through the user-state config surface, never the read-only graph API or the /ops proxy. Mirror the live shape in the mock.

- [x] `P02.S06` - Add the GET /workspaces route returning id, label, path, launch-default marker, reachability, and the tiers block; `engine/crates/vaultspec-api/src/routes/registry.rs`.
- [x] `P02.S07` - Add the optional workspace= parameter to /map defaulting to the active workspace with unchanged single-workspace behaviour; `engine/crates/vaultspec-api/src/routes/registry.rs`.
- [x] `P02.S08` - Add the active_workspace field and its PUT handling to the session endpoint; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [x] `P02.S09` - Route registry add and forget through the user-state config surface, not the graph API or the ops proxy; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [x] `P02.S10` - Mirror the /workspaces and extended /map and /session shapes in the frontend mock fixtures; `frontend/src/stores/server/`.

### Phase `P03` - Scope routing across workspaces

Route scope across workspaces: validate_scope resolves a worktree against the active workspace's enumerable worktrees; warm scope cells may belong to any registered reachable workspace; each scope keeps its own monotonic delta clock so SSE resume stays correct.

- [x] `P03.S11` - Change validate_scope to resolve a worktree against the active workspace's enumerable worktrees; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `P03.S12` - Let warm scope cells belong to any registered reachable workspace while preserving per-scope delta clocks; `engine/crates/vaultspec-session/src/session.rs`.

### Phase `P04` - Frontend workspace switcher

Host the workspace switcher above the worktree switcher in the left rail: a stores query over /workspaces, a picker that renders as a quiet header when only one root exists, an add-a-project affordance with an honest validation refusal, and a workspace-level wholesale reset (the full 022 reset plus clearing the cached worktree set) owned by the stores layer.

- [x] `P04.S13` - Add a stores query hook for /workspaces and the active-workspace selector; `frontend/src/stores/server/`.
- [x] `P04.S14` - Widen the wholesale scope reset to also clear the cached worktree set on a workspace swap; `frontend/src/stores/view/`.
- [x] `P04.S15` - Author the WorkspacePicker rendering roots, launch-default and unreachable markers, and the add-a-project affordance; `frontend/src/app/left/WorkspacePicker.tsx`.
- [x] `P04.S16` - Host the workspace switcher above the worktree switcher and render it as a quiet header when only one root exists; `frontend/src/app/AppShell.tsx`.

### Phase `P05` - Verification

Verify: extend the scope-isolation tests to workspace swaps (no cross-project bleed), roundtrip the registry persistence, prove the four honest states, and pass the feature-scoped lint, test, and vault-check gates.

- [x] `P05.S17` - Extend the scope-isolation adversarial tests to cover workspace swaps with no cross-project state bleed; `frontend/src/stores/__adversarial__/`.
- [x] `P05.S18` - Test the WorkspacePicker four honest states and the add-a-project validation refusal; `frontend/src/app/left/WorkspacePicker.render.test.tsx`.
- [x] `P05.S19` - Run the feature-scoped lint, test, and vault-check gates to green; `engine/crates/vaultspec-session/`.

## Description

## Steps

## Parallelization

## Verification
