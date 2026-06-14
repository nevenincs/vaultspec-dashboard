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
  - '[[2026-06-14-user-state-persistence-W01-P02-S05]]'
  - '[[2026-06-14-user-state-persistence-W01-P02-S06]]'
  - '[[2026-06-14-user-state-persistence-W01-P02-S07]]'
  - '[[2026-06-14-user-state-persistence-W01-P02-S08]]'
  - '[[2026-06-14-user-state-persistence-adr]]'
  - '[[2026-06-14-user-state-persistence-plan]]'
  - '[[2026-06-14-user-state-persistence-research]]'
---

# `user-state-persistence` feature index

Auto-generated index of all documents tagged with `#user-state-persistence`.

## Documents

### adr

- `2026-06-14-user-state-persistence-adr` - `user-state-persistence` adr: `co-resident orchestration layer for session state and workspace selection` | (**status:** `accepted`)

### exec

- `2026-06-14-user-state-persistence-W01-P01-S01` - add the new workspace crate manifest
- `2026-06-14-user-state-persistence-W01-P01-S02` - register the new crate in the workspace members
- `2026-06-14-user-state-persistence-W01-P01-S03` - implement the best-effort user-state SQLite store with open-or-heal recreate-on-corrupt
- `2026-06-14-user-state-persistence-W01-P01-S04` - define the session and settings table schema and migration-free init
- `2026-06-14-user-state-persistence-W01-P02-S05` - implement the session model for active workspace and scope and per-scope folder and feature-tag contexts and recents
- `2026-06-14-user-state-persistence-W01-P02-S06` - implement the settings model with global and scoped keys
- `2026-06-14-user-state-persistence-W01-P02-S07` - expose the crate handle and document the read-and-infer fence
- `2026-06-14-user-state-persistence-W01-P02-S08` - add roundtrip and corrupt-recreate and recents-ordering tests

### plan

- `2026-06-14-user-state-persistence-plan` - `user-state-persistence` plan

### research

- `2026-06-14-user-state-persistence-research` - `user-state-persistence` research: `application session-state and delegation layer`
