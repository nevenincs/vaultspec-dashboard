---
tags:
  - '#plan'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-14-dashboard-code-tree-adr]]'
  - '[[2026-06-14-dashboard-left-rail-research]]'
---








# `dashboard-code-tree` plan

### Phase `P01` - Backend listing endpoint

Add a read-only GET /file-tree endpoint returning one directory level at a time over the active scope: metadata only (no file bytes), repository-ignore-aware, hard-capped and cursor-paginated, carrying the tiers block and degrading honestly on a remote-ref or structural-absent scope. Mirrors the /vault-tree shape with directory nesting.



- [x] `P01.S01` - Add the read-only GET /file-tree?scope=&path=&cursor= route returning one directory level beside the vault-tree handler; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P01.S02` - Return per child the repo-relative path, kind dir or file, has_children hint, and code:<path> node id, metadata only with no bytes; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P01.S03` - Honor repository ignore rules via the gix machinery to exclude .git, build output, and vendored trees; `engine/crates/ingest-git/`.
- [x] `P01.S04` - Hard-cap each level, cursor-paginate a pathological directory, and emit a truncated-style honesty marker; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P01.S05` - Degrade honestly for a remote-ref scope or absent structural tier while carrying the tiers block; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `P02` - Interlink and contract

Derive the code:<path> node id through the shared node_id rule (no private convention) so a file row joins the graph, define the wire contract types, and mirror the shape in the frontend mock.

- [x] `P02.S06` - Derive code:<path> through the shared node_id rule with no private convention; `engine/crates/engine-model/src/`.
- [x] `P02.S07` - Define the file-tree response wire contract types; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P02.S08` - Mirror the /file-tree response shape in the frontend mock fixtures; `frontend/src/stores/server/`.

### Phase `P03` - Frontend code mode

Render the /file-tree projection as a lazy, collapsible directory hierarchy (Lucide chevrons, Phosphor file/dir marks passing the 14px grayscale gate, monospace path identity), with a bidirectional selection join to code: stage nodes mirroring the vault browser's doc:<stem> join, per-scope caching, and a quiet absent-interlink state for unindexed files. The vault/code mode toggle itself is owned by the left-rail IA plan.

- [x] `P03.S09` - Add a stores query hook for /file-tree with lazy per-directory fetch and per-scope cache; `frontend/src/stores/server/`.
- [x] `P03.S10` - Author the code-mode view rendering the directory hierarchy as lazy collapsible disclosure rows with Lucide chevrons and Phosphor file marks; `frontend/src/app/left/CodeTree.tsx`.
- [x] `P03.S11` - Join code-row selection bidirectionally to code: stage nodes mirroring the doc:<stem> join; `frontend/src/app/left/browserSelection.ts`.
- [x] `P03.S12` - Render a quiet absent-interlink state for files with no graph node; `frontend/src/app/left/CodeTree.tsx`.

### Phase `P04` - Verification

Verify: bounded reads truncate and paginate honestly, gitignore exclusion and worktree-only degradation hold, the selection join works both directions, the four honest states render, and the feature-scoped lint, test, and vault-check gates pass.

- [x] `P04.S13` - Prove bounded reads: a capped directory level truncates honestly and cursor-paginates; `engine/crates/vaultspec-api/tests/`.
- [x] `P04.S14` - Prove gitignore exclusion and worktree-only honest degradation; `engine/crates/vaultspec-api/tests/`.
- [x] `P04.S15` - Test the code-mode selection join both directions and the four honest states; `frontend/src/app/left/`.
- [x] `P04.S16` - Run the feature-scoped lint, test, and vault-check gates to green; `engine/crates/vaultspec-api/`.

## Description


## Steps







## Parallelization


## Verification

