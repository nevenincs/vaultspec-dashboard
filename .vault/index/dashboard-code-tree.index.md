---
generated: true
tags:
  - '#index'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - '[[2026-06-14-dashboard-code-tree-P01-S01]]'
  - '[[2026-06-14-dashboard-code-tree-P01-S02]]'
  - '[[2026-06-14-dashboard-code-tree-P01-S03]]'
  - '[[2026-06-14-dashboard-code-tree-P01-S04]]'
  - '[[2026-06-14-dashboard-code-tree-P01-S05]]'
  - '[[2026-06-14-dashboard-code-tree-P02-S06]]'
  - '[[2026-06-14-dashboard-code-tree-P02-S07]]'
  - '[[2026-06-14-dashboard-code-tree-P02-S08]]'
  - '[[2026-06-14-dashboard-code-tree-P03-S09]]'
  - '[[2026-06-14-dashboard-code-tree-P03-S10]]'
  - '[[2026-06-14-dashboard-code-tree-P03-S11]]'
  - '[[2026-06-14-dashboard-code-tree-P03-S12]]'
  - '[[2026-06-14-dashboard-code-tree-P04-S13]]'
  - '[[2026-06-14-dashboard-code-tree-P04-S14]]'
  - '[[2026-06-14-dashboard-code-tree-P04-S15]]'
  - '[[2026-06-14-dashboard-code-tree-P04-S16]]'
  - '[[2026-06-14-dashboard-code-tree-adr]]'
  - '[[2026-06-14-dashboard-code-tree-plan]]'
---

# `dashboard-code-tree` feature index

Auto-generated index of all documents tagged with `#dashboard-code-tree`.

## Documents

### adr

- `2026-06-14-dashboard-code-tree-adr` - `dashboard-code-tree` adr: `read-only codebase file-tree browser` | (**status:** `accepted`)

### exec

- `2026-06-14-dashboard-code-tree-P01-S01` - Add the read-only GET /file-tree?scope=&path=&cursor= route returning one directory level beside the vault-tree handler
- `2026-06-14-dashboard-code-tree-P01-S02` - Return per child the repo-relative path, kind dir or file, has_children hint, and code:<path> node id, metadata only with no bytes
- `2026-06-14-dashboard-code-tree-P01-S03` - Honor repository ignore rules via the gix machinery to exclude .git, build output, and vendored trees
- `2026-06-14-dashboard-code-tree-P01-S04` - Hard-cap each level, cursor-paginate a pathological directory, and emit a truncated-style honesty marker
- `2026-06-14-dashboard-code-tree-P01-S05` - Degrade honestly for a remote-ref scope or absent structural tier while carrying the tiers block
- `2026-06-14-dashboard-code-tree-P02-S06` - Derive code:<path> through the shared node_id rule with no private convention
- `2026-06-14-dashboard-code-tree-P02-S07` - Define the file-tree response wire contract types
- `2026-06-14-dashboard-code-tree-P02-S08` - Mirror the /file-tree response shape in the frontend mock fixtures
- `2026-06-14-dashboard-code-tree-P03-S09` - Add a stores query hook for /file-tree with lazy per-directory fetch and per-scope cache
- `2026-06-14-dashboard-code-tree-P03-S10` - Author the code-mode view rendering the directory hierarchy as lazy collapsible disclosure rows with Lucide chevrons and Phosphor file marks
- `2026-06-14-dashboard-code-tree-P03-S11` - Join code-row selection bidirectionally to code: stage nodes mirroring the doc:<stem> join
- `2026-06-14-dashboard-code-tree-P03-S12` - Render a quiet absent-interlink state for files with no graph node
- `2026-06-14-dashboard-code-tree-P04-S13` - Prove bounded reads: a capped directory level truncates honestly and cursor-paginates
- `2026-06-14-dashboard-code-tree-P04-S14` - Prove gitignore exclusion and worktree-only honest degradation
- `2026-06-14-dashboard-code-tree-P04-S15` - Test the code-mode selection join both directions and the four honest states
- `2026-06-14-dashboard-code-tree-P04-S16` - Run the feature-scoped lint, test, and vault-check gates to green

### plan

- `2026-06-14-dashboard-code-tree-plan` - `dashboard-code-tree` plan
