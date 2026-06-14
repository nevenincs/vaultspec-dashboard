---
generated: true
tags:
  - '#index'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-14-user-state-persistence-W01-P01-S01]]'
  - '[[2026-06-14-user-state-persistence-W01-P01-S02]]'
  - '[[2026-06-14-user-state-persistence-W01-P01-S03]]'
  - '[[2026-06-14-user-state-persistence-W01-P01-S04]]'
  - '[[2026-06-14-user-state-persistence-W01-P01-summary]]'
  - '[[2026-06-14-user-state-persistence-W01-P02-S05]]'
  - '[[2026-06-14-user-state-persistence-W01-P02-S06]]'
  - '[[2026-06-14-user-state-persistence-W01-P02-S07]]'
  - '[[2026-06-14-user-state-persistence-W01-P02-S08]]'
  - '[[2026-06-14-user-state-persistence-W02-P03-S09]]'
  - '[[2026-06-14-user-state-persistence-W02-P03-S10]]'
  - '[[2026-06-14-user-state-persistence-W02-P03-S11]]'
  - '[[2026-06-14-user-state-persistence-W02-P03-summary]]'
  - '[[2026-06-14-user-state-persistence-W02-P04-S12]]'
  - '[[2026-06-14-user-state-persistence-W02-P04-S13]]'
  - '[[2026-06-14-user-state-persistence-W02-P04-S14]]'
  - '[[2026-06-14-user-state-persistence-W02-P04-S15]]'
  - '[[2026-06-14-user-state-persistence-W02-P05-S16]]'
  - '[[2026-06-14-user-state-persistence-W02-P05-S17]]'
  - '[[2026-06-14-user-state-persistence-W02-P05-S18]]'
  - '[[2026-06-14-user-state-persistence-W03-P06-S19]]'
  - '[[2026-06-14-user-state-persistence-W03-P06-S20]]'
  - '[[2026-06-14-user-state-persistence-W03-P06-S21]]'
  - '[[2026-06-14-user-state-persistence-W03-P06-S22]]'
  - '[[2026-06-14-user-state-persistence-W03-P06-summary]]'
  - '[[2026-06-14-user-state-persistence-W03-P07-S23]]'
  - '[[2026-06-14-user-state-persistence-W03-P07-S24]]'
  - '[[2026-06-14-user-state-persistence-W04-P08-S25]]'
  - '[[2026-06-14-user-state-persistence-W04-P08-S26]]'
  - '[[2026-06-14-user-state-persistence-W04-P08-S27]]'
  - '[[2026-06-14-user-state-persistence-W04-P08-S28]]'
  - '[[2026-06-14-user-state-persistence-W04-P08-summary]]'
  - '[[2026-06-14-user-state-persistence-W04-P09-S29]]'
  - '[[2026-06-14-user-state-persistence-W04-P09-S30]]'
  - '[[2026-06-14-user-state-persistence-W04-P09-S31]]'
  - '[[2026-06-14-user-state-persistence-W04-P09-S32]]'
  - '[[2026-06-14-user-state-persistence-W04-P10-S33]]'
  - '[[2026-06-14-user-state-persistence-W04-P10-S34]]'
  - '[[2026-06-14-user-state-persistence-W04-P10-S35]]'
  - '[[2026-06-14-user-state-persistence-adr]]'
  - '[[2026-06-14-user-state-persistence-audit]]'
  - '[[2026-06-14-user-state-persistence-plan]]'
  - '[[2026-06-14-user-state-persistence-research]]'
---

# `user-state-persistence` feature index

Auto-generated index of all documents tagged with `#user-state-persistence`.

## Documents

### adr

- `2026-06-14-user-state-persistence-adr` - `user-state-persistence` adr: `co-resident orchestration layer for session state and workspace selection` | (**status:** `accepted`)

### audit

- `2026-06-14-user-state-persistence-audit` - `user-state-persistence` audit: `live production verification and hardening campaign`

### exec

- `2026-06-14-user-state-persistence-W01-P01-S01` - add the new workspace crate manifest
- `2026-06-14-user-state-persistence-W01-P01-S02` - register the new crate in the workspace members
- `2026-06-14-user-state-persistence-W01-P01-S03` - implement the best-effort user-state SQLite store with open-or-heal recreate-on-corrupt
- `2026-06-14-user-state-persistence-W01-P01-S04` - define the session and settings table schema and migration-free init
- `2026-06-14-user-state-persistence-W01-P01-summary` - `user-state-persistence` `W01.P01` summary
- `2026-06-14-user-state-persistence-W01-P02-S05` - implement the session model for active workspace and scope and per-scope folder and feature-tag contexts and recents
- `2026-06-14-user-state-persistence-W01-P02-S06` - implement the settings model with global and scoped keys
- `2026-06-14-user-state-persistence-W01-P02-S07` - expose the crate handle and document the read-and-infer fence
- `2026-06-14-user-state-persistence-W01-P02-S08` - add roundtrip and corrupt-recreate and recents-ordering tests
- `2026-06-14-user-state-persistence-W02-P03-S09` - extract the single-graph serve fields into a per-scope cell struct
- `2026-06-14-user-state-persistence-W02-P03-S10` - implement the scope registry with lazy build and LRU working-set cap and eviction
- `2026-06-14-user-state-persistence-W02-P03-S11` - restore and persist the active scope through the session crate at serve boot
- `2026-06-14-user-state-persistence-W02-P03-summary` - `user-state-persistence` `W02.P03` summary
- `2026-06-14-user-state-persistence-W02-P04-S12` - move commit-graph and rebuild-and-swap onto the cell with a per-scope monotonic clock
- `2026-06-14-user-state-persistence-W02-P04-S13` - spawn and tear down the watcher per warm scope
- `2026-06-14-user-state-persistence-W02-P04-S14` - make the SSE stream and since resume per-scope from the cell ring
- `2026-06-14-user-state-persistence-W02-P04-S15` - rewrite validate-scope to accept any selectable vault-bearing worktree in the workspace
- `2026-06-14-user-state-persistence-W02-P05-S16` - resolve the cell via the registry in the graph and vault-tree and filters and node routes
- `2026-06-14-user-state-persistence-W02-P05-S17` - resolve the cell via the registry in the temporal routes
- `2026-06-14-user-state-persistence-W02-P05-S18` - resolve the cell via the registry in the ops routes
- `2026-06-14-user-state-persistence-W03-P06-S19` - add GET and PUT session endpoints carrying the tiers block
- `2026-06-14-user-state-persistence-W03-P06-S20` - add GET and PUT settings endpoints carrying the tiers block
- `2026-06-14-user-state-persistence-W03-P06-S21` - wire the new routes into the router and the bearer-gated API prefixes
- `2026-06-14-user-state-persistence-W03-P06-S22` - register the session route prefixes in the SPA gate
- `2026-06-14-user-state-persistence-W03-P06-summary` - `user-state-persistence` `W03.P06` summary
- `2026-06-14-user-state-persistence-W03-P07-S23` - add session and settings endpoint integration tests
- `2026-06-14-user-state-persistence-W03-P07-S24` - add a registry scope-switch and per-scope resume integration test
- `2026-06-14-user-state-persistence-W04-P08-S25` - add session and settings client methods and snake_case wire types
- `2026-06-14-user-state-persistence-W04-P08-S26` - add session and settings query and mutation hooks and keys
- `2026-06-14-user-state-persistence-W04-P08-S27` - mirror the new session and settings wire shape in the mock engine double
- `2026-06-14-user-state-persistence-W04-P08-S28` - extend the tolerant live adapter for the new shapes
- `2026-06-14-user-state-persistence-W04-P08-summary` - `user-state-persistence` `W04.P08` summary
- `2026-06-14-user-state-persistence-W04-P09-S29` - restore the persisted session on load instead of recomputing the default scope
- `2026-06-14-user-state-persistence-W04-P09-S30` - seed and persist scope and folder context in the view store through the session API
- `2026-06-14-user-state-persistence-W04-P09-S31` - persist worktree selection through the session API
- `2026-06-14-user-state-persistence-W04-P09-S32` - represent the current folder and its feature-tag contexts as a view selector
- `2026-06-14-user-state-persistence-W04-P10-S33` - add stores tests for the session client and restore and persistence
- `2026-06-14-user-state-persistence-W04-P10-S34` - add a mock-versus-live parity test feeding a captured sample through the adapter
- `2026-06-14-user-state-persistence-W04-P10-S35` - run the full lint gate and the engine and frontend test suites to green

### plan

- `2026-06-14-user-state-persistence-plan` - `user-state-persistence` plan

### research

- `2026-06-14-user-state-persistence-research` - `user-state-persistence` research: `application session-state and delegation layer`
