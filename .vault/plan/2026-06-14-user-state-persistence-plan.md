---
tags:
  - '#plan'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
tier: L3
related:
  - '[[2026-06-14-user-state-persistence-adr]]'
  - '[[2026-06-14-user-state-persistence-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `user-state-persistence` plan

## Wave `W01` - vaultspec-session crate: durable store and session/settings domain

Establish the co-resident orchestration crate that owns durable session state, user settings, and a best-effort SQLite user-state store; this is foundational and W02 depends on it for persistence wiring.

### Phase `W01.P01` - scaffold the crate and the best-effort SQLite store

Stand up the new workspace crate and the best-effort user-state SQLite store with open-or-heal recreate-on-corrupt.

- [x] `W01.P01.S01` - add the new workspace crate manifest; `engine/crates/vaultspec-session/Cargo.toml`.
- [x] `W01.P01.S02` - register the new crate in the workspace members; `engine/Cargo.toml`.
- [x] `W01.P01.S03` - implement the best-effort user-state SQLite store with open-or-heal recreate-on-corrupt; `engine/crates/vaultspec-session/src/store.rs`.
- [x] `W01.P01.S04` - define the session and settings table schema and migration-free init; `engine/crates/vaultspec-session/src/schema.rs`.

### Phase `W01.P02` - session and settings domain plus tests

Implement the session and settings domain models over the store and cover them with roundtrip, corrupt-recreate, and recents-ordering tests.

- [x] `W01.P02.S05` - implement the session model for active workspace and scope and per-scope folder and feature-tag contexts and recents; `engine/crates/vaultspec-session/src/session.rs`.
- [x] `W01.P02.S06` - implement the settings model with global and scoped keys; `engine/crates/vaultspec-session/src/settings.rs`.
- [x] `W01.P02.S07` - expose the crate handle and document the read-and-infer fence; `engine/crates/vaultspec-session/src/lib.rs`.
- [x] `W01.P02.S08` - add roundtrip and corrupt-recreate and recents-ordering tests; `engine/crates/vaultspec-session/tests/store_test.rs`.

## Wave `W02` - engine multi-scope registry refactor of vaultspec-api

Generalize the single-AppState serve layer into a warm multi-scope scope registry routed by scope and bounded by a working-set cap; this is the biggest blast radius, depends on W01, and W03 depends on it.

### Phase `W02.P03` - extract the per-scope cell and build the registry

Extract the single-graph serve fields into a per-scope cell and build the scope registry with lazy build and LRU working-set cap.

- [x] `W02.P03.S09` - extract the single-graph serve fields into a per-scope cell struct; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `W02.P03.S10` - implement the scope registry with lazy build and LRU working-set cap and eviction; `engine/crates/vaultspec-api/src/registry.rs`.
- [x] `W02.P03.S11` - restore and persist the active scope through the session crate at serve boot; `engine/crates/vaultspec-api/src/lib.rs`.

### Phase `W02.P04` - make serve infrastructure per-scope

Move the commit-graph path, watcher lifecycle, SSE resume, and scope validation onto the per-scope cell so live state is correct per scope.

- [x] `W02.P04.S12` - move commit-graph and rebuild-and-swap onto the cell with a per-scope monotonic clock; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `W02.P04.S13` - spawn and tear down the watcher per warm scope; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W02.P04.S14` - make the SSE stream and since resume per-scope from the cell ring; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [x] `W02.P04.S15` - rewrite validate-scope to accept any selectable vault-bearing worktree in the workspace; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `W02.P05` - resolve scope through the registry on every read route

Resolve the per-scope cell via the registry on every read route so each request serves the selected scope.

- [x] `W02.P05.S16` - resolve the cell via the registry in the graph and vault-tree and filters and node routes; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `W02.P05.S17` - resolve the cell via the registry in the temporal routes; `engine/crates/vaultspec-api/src/routes/temporal.rs`.
- [x] `W02.P05.S18` - resolve the cell via the registry in the ops routes; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Wave `W03` - top-level session and settings API surface

Add the session and settings endpoints through the shared envelope helper so every response carries the tiers block; depends on W02 and W04 depends on it.

### Phase `W03.P06` - session and settings endpoints through the shared envelope

Add the session and settings GET and PUT endpoints through the shared envelope helper and wire them into the router and gates.

- [x] `W03.P06.S19` - add GET and PUT session endpoints carrying the tiers block; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [x] `W03.P06.S20` - add GET and PUT settings endpoints carrying the tiers block; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [x] `W03.P06.S21` - wire the new routes into the router and the bearer-gated API prefixes; `engine/crates/vaultspec-api/src/routes/mod.rs`.
- [x] `W03.P06.S22` - register the session route prefixes in the SPA gate; `engine/crates/vaultspec-api/src/routes/spa.rs`.

### Phase `W03.P07` - live-shape conformance and integration tests

Cover the new endpoints and the registry scope-switch with live-shape conformance and end-to-end integration tests.

- [x] `W03.P07.S23` - add session and settings endpoint integration tests; `engine/tests/tests/conformance.rs`.
- [x] `W03.P07.S24` - add a registry scope-switch and per-scope resume integration test; `engine/tests/tests/e2e.rs`.

## Wave `W04` - frontend stores integration as the sole wire client

Wire the session and settings surface through the stores layer as the sole wire client, restore the persisted session on load, and persist selection; depends on W03.

### Phase `W04.P08` - session and settings client, types, and query layer

Add the session and settings client methods, wire types, query and mutation hooks, mock double, and tolerant adapter.

- [x] `W04.P08.S25` - add session and settings client methods and snake_case wire types; `frontend/src/stores/server/engine.ts`.
- [x] `W04.P08.S26` - add session and settings query and mutation hooks and keys; `frontend/src/stores/server/queries.ts`.
- [x] `W04.P08.S27` - mirror the new session and settings wire shape in the mock engine double; `frontend/src/testing/mockEngine.ts`.
- [x] `W04.P08.S28` - extend the tolerant live adapter for the new shapes; `frontend/src/stores/server/liveAdapters.ts`.

### Phase `W04.P09` - restore-on-load and selection persistence

Restore the persisted session on load and persist scope, folder context, and worktree selection through the session API.

- [x] `W04.P09.S29` - restore the persisted session on load instead of recomputing the default scope; `frontend/src/app/stage/Stage.tsx`.
- [x] `W04.P09.S30` - seed and persist scope and folder context in the view store through the session API; `frontend/src/stores/view/viewStore.ts`.
- [x] `W04.P09.S31` - persist worktree selection through the session API; `frontend/src/app/left/WorktreePicker.tsx`.
- [ ] `W04.P09.S32` - represent the current folder and its feature-tag contexts as a view selector; `frontend/src/app/left/browserSelection.ts`.

### Phase `W04.P10` - tests and the full lint gate

Cover the client, restore, and persistence with stores tests and a mock-versus-live parity test, then run the full lint gate and test suites to green.

- [ ] `W04.P10.S33` - add stores tests for the session client and restore and persistence; `frontend/src/stores/server/session.test.ts`.
- [ ] `W04.P10.S34` - add a mock-versus-live parity test feeding a captured sample through the adapter; `frontend/src/stores/server/liveAdapters.session.test.ts`.
- [ ] `W04.P10.S35` - run the full lint gate and the engine and frontend test suites to green; `just dev lint all`.

## Description

This plan realizes the `2026-06-14-user-state-persistence-adr` decision, grounded in `2026-06-14-user-state-persistence-research`: it ends reload amnesia by adding the co-resident orchestration layer the foundation contract reserved as "builds beside", introducing a new `vaultspec-session` crate that owns a best-effort SQLite user-state store and the session and settings domain, generalizing the single-`AppState` serve layer into a warm multi-scope registry so the user can browse across worktrees, exposing a top-level session and settings API surface, and wiring the frontend `stores` layer as the sole client that restores the persisted session on load. Per the explicit prototype posture this is a full rollout with no deferrals; persistence is best-effort with nothing safeguarded, so a corrupt store is recreated empty exactly like the re-derivable cache.

## Parallelization

The four Waves are sequenced `W01` -> `W02` -> `W03` -> `W04`: each Wave must land before the next can begin. `W01` can begin immediately and is independent of the rest until `W02` wires persistence against it. Within `W02` the Phases carry hard ordering: `W02.P03` (extract the per-scope cell and build the registry) precedes `W02.P04` (make serve infrastructure per-scope) precedes `W02.P05` (resolve scope through the registry on every read route) - the cell must exist before the per-scope infrastructure can move onto it, and that infrastructure must exist before the read routes can resolve through the registry. Within `W04`, `W04.P08` (client, types, and query layer) precedes `W04.P09` (restore-on-load and selection persistence) and `W04.P10` (tests and the full lint gate), which both consume the client and types `W04.P08` lands.

## Verification

The plan is complete when every Step is closed (`- [x]`) and these checks pass: `just dev lint all` exits 0, covering eslint, prettier, and tsc on the frontend and `cargo fmt --check` plus `cargo clippy` on the engine, per the declaring-green-runs-the-full-gate discipline; the engine and frontend test suites are green; the mock engine double mirrors the new live session and settings wire shape, proven by the mock-versus-live parity test feeding a captured sample through the tolerant adapter, per mock-mirrors-live-wire-shape; every new wire response carries the per-tier `tiers` block through the shared envelope helper; reload restores the persisted session, including the active scope and the active folder and its feature-tag contexts, instead of recomputing a default; switching worktrees serves the correct scope with correct per-scope SSE `since=` resume against each scope's own monotonic clock; and the inference crates (`engine-graph`, `engine-query`, `engine-store`, and the `ingest-*` crates) are unchanged. The `engine-read-and-infer` rule amendment naming the orchestration-crate exception is a codify-phase follow-up, not a Step in this plan.
