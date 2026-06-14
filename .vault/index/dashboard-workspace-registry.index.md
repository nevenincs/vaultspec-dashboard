---
generated: true
tags:
  - '#index'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-14-dashboard-workspace-registry-P01-S01]]'
  - '[[2026-06-14-dashboard-workspace-registry-P01-S02]]'
  - '[[2026-06-14-dashboard-workspace-registry-P01-S03]]'
  - '[[2026-06-14-dashboard-workspace-registry-P01-S04]]'
  - '[[2026-06-14-dashboard-workspace-registry-P01-S05]]'
  - '[[2026-06-14-dashboard-workspace-registry-P02-S06]]'
  - '[[2026-06-14-dashboard-workspace-registry-P02-S07]]'
  - '[[2026-06-14-dashboard-workspace-registry-P02-S08]]'
  - '[[2026-06-14-dashboard-workspace-registry-P02-S09]]'
  - '[[2026-06-14-dashboard-workspace-registry-P02-S10]]'
  - '[[2026-06-14-dashboard-workspace-registry-P03-S11]]'
  - '[[2026-06-14-dashboard-workspace-registry-P03-S12]]'
  - '[[2026-06-14-dashboard-workspace-registry-adr]]'
  - '[[2026-06-14-dashboard-workspace-registry-plan]]'
---

# `dashboard-workspace-registry` feature index

Auto-generated index of all documents tagged with `#dashboard-workspace-registry`.

## Documents

### adr

- `2026-06-14-dashboard-workspace-registry-adr` - `dashboard-workspace-registry` adr: `multi-workspace project-root registry` | (**status:** `accepted`)

### exec

- `2026-06-14-dashboard-workspace-registry-P01-S01` - Define the WorkspaceRoot record and registry schema (stable id from git common dir, label, path, reachability)
- `2026-06-14-dashboard-workspace-registry-P01-S02` - Implement the durable workspace-registry table with best-effort open-or-heal in the user-state store
- `2026-06-14-dashboard-workspace-registry-P01-S03` - Auto-register the launch workspace as the first root on first run
- `2026-06-14-dashboard-workspace-registry-P01-S04` - Implement read-only add, forget, and select-active registry operations that never mutate a repository
- `2026-06-14-dashboard-workspace-registry-P01-S05` - Roundtrip-test registry persistence and corrupt-store recreation
- `2026-06-14-dashboard-workspace-registry-P02-S06` - Add the GET /workspaces route returning id, label, path, launch-default marker, reachability, and the tiers block
- `2026-06-14-dashboard-workspace-registry-P02-S07` - Add the optional workspace= parameter to /map defaulting to the active workspace with unchanged single-workspace behaviour
- `2026-06-14-dashboard-workspace-registry-P02-S08` - Add the active_workspace field and its PUT handling to the session endpoint
- `2026-06-14-dashboard-workspace-registry-P02-S09` - Route registry add and forget through the user-state config surface, not the graph API or the ops proxy
- `2026-06-14-dashboard-workspace-registry-P02-S10` - Mirror the /workspaces and extended /map and /session shapes in the frontend mock fixtures
- `2026-06-14-dashboard-workspace-registry-P03-S11` - Change validate_scope to resolve a worktree against the active workspace's enumerable worktrees
- `2026-06-14-dashboard-workspace-registry-P03-S12` - Let warm scope cells belong to any registered reachable workspace while preserving per-scope delta clocks

### plan

- `2026-06-14-dashboard-workspace-registry-plan` - `dashboard-workspace-registry` plan
