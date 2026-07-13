---
tags:
  - '#plan'
  - '#codebase-graphing-review'
date: '2026-07-02'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-02-codebase-graphing-review-audit]]'
  - '[[2026-07-02-codebase-graphing-adr]]'
---

# `codebase-graphing-review` plan

### Phase `P01` - Ingest correctness and module wire

Package-aware entry-file titling, module-name hygiene, the Python multi-name resolver fix, the token-map guard, and serving module + module_hue per code node.

- [x] `P01.S01` - CGR-003: package-aware entry-file titling at minting for all four languages (py __init__.py -> package dir name, js index.ts -> dir, rust mod.rs/lib.rs -> crate/dir) instead of bare last_segment; `engine ingest-code modules.rs`.
- [x] `P01.S02` - CGR-004: module-node title hygiene - qualify repo-wide collisions (many 'src') and rename the root module from '.' to a user-facing name; `engine ingest-code`.
- [x] `P01.S03` - CGR-005: resolve ALL submodules in a Python multi-name from-import (from pkg import a, b), mirroring the correct Rust brace handling - fixes the silent edge undercount; `engine ingest-code resolve.rs`.
- [x] `P01.S04` - CGR-007: dedupe the language_token drift trap (code.rs vs lang.rs) behind one source; `engine ingest-code`.
- [x] `P01.S05` - Serve module + module_hue (0..6|null) + optional depth per code node - per-generation hue assignment ranking top-level modules by member count (backend-served classification); `engine-query/engine-graph code projection + wire`.

### Phase `P02` - Visualization: module coloring and legend

Consume module_hue to color code nodes by module identity, size directories by member count, and swap the legend to top-module rows for the code corpus.

- [x] `P02.S06` - CGR-002 color: add a module-hue branch to appearance.ts nodeColorNumber mapping module_hue 0..6 to the seven --color-scene-category-* literal-hex tokens, depth to lightness via NODE_RECEDE_MIX, long-tail to the neutral code hue (no new hex); `frontend/src/scene appearance.ts`.
- [x] `P02.S07` - CGR-002 size: include code-module (directory) nodes in the memberCount radius branch so directories size by member count like features; `frontend/src/scene appearance.ts`.
- [x] `P02.S08` - CGR-002 legend: swap the legend to top-module color rows when the corpus is code (doubling as dir_prefix narrows); `frontend legend surface`.

## Description

## Steps

## Parallelization

## Verification
