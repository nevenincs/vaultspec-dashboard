---
generated: true
tags:
  - '#index'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - '[[2026-07-02-codebase-graphing-W01-P01-S01]]'
  - '[[2026-07-02-codebase-graphing-W01-P02-S02]]'
  - '[[2026-07-02-codebase-graphing-W01-P02-S03]]'
  - '[[2026-07-02-codebase-graphing-W01-P02-S04]]'
  - '[[2026-07-02-codebase-graphing-W01-P02-S05]]'
  - '[[2026-07-02-codebase-graphing-W01-P02-S06]]'
  - '[[2026-07-02-codebase-graphing-W01-P02-S07]]'
  - '[[2026-07-02-codebase-graphing-W02-P03-S08]]'
  - '[[2026-07-02-codebase-graphing-W03-P04-S09]]'
  - '[[2026-07-02-codebase-graphing-W04-P05-S10]]'
  - '[[2026-07-02-codebase-graphing-W04-P05-S11]]'
  - '[[2026-07-02-codebase-graphing-W04-P05-S12]]'
  - '[[2026-07-02-codebase-graphing-W05-P06-S13]]'
  - '[[2026-07-02-codebase-graphing-W05-P06-S14]]'
  - '[[2026-07-02-codebase-graphing-W05-P06-S15]]'
  - '[[2026-07-02-codebase-graphing-adr]]'
  - '[[2026-07-02-codebase-graphing-plan]]'
  - '[[2026-07-02-codebase-graphing-research]]'
---

# `codebase-graphing` feature index

Auto-generated index of all documents tagged with `#codebase-graphing`.

## Documents

### adr

- `2026-07-02-codebase-graphing-adr` - `codebase-graphing` adr: `a disconnected code graph corpus served beside the vault LinkageGraph` | (**status:** `accepted`)

### exec

- `2026-07-02-codebase-graphing-W01-P01-S01` - Add NodeKind::CodeModule, CanonicalKey::CodeModule (wire prefix code-mod), RelationKind::Imports, and Provenance::TreeLayout with serde and as_str coverage plus id-form tests
- `2026-07-02-codebase-graphing-W01-P02-S02` - Scaffold the workspace crate with tree-sitter plus Rust/TypeScript/JavaScript/Python grammar dependencies and the CodeGraphData output type
- `2026-07-02-codebase-graphing-W01-P02-S03` - Implement the bounded ignore-aware source walk with file-count and file-size caps and Cargo manifest collection
- `2026-07-02-codebase-graphing-W01-P02-S04` - Author per-language import queries and the query-driven extractor with compiled-query caching and Python from-name walking
- `2026-07-02-codebase-graphing-W01-P02-S05` - Implement per-language import-path resolution over the walked set: Rust use/mod with workspace crate map, TS/JS relative probing with ESM js-to-ts swap, Python absolute/relative/submodule probing
- `2026-07-02-codebase-graphing-W01-P02-S06` - Mint file nodes, module nodes for source-bearing directories, contains edges, and deduplicated multiplicity-counted imports edges
- `2026-07-02-codebase-graphing-W01-P02-S07` - Add the source-tree fingerprint cache key and the extraction orchestration with rayon parallel parse and honest counters, plus the scan example
- `2026-07-02-codebase-graphing-W02-P03-S08` - Add CodeGraphCell beside the vault graph on ScopeCell: own LinkageGraph instance, own generation with swap-happens-before-bump, debounced fingerprint probe, lazy re-extract, honest stats snapshot
- `2026-07-02-codebase-graphing-W03-P04-S09` - Implement the code-corpus query projections: module-rollup meta-edge aggregation, file-granularity slice with endpoint pruning, dir-prefix and language narrowing, and the per-corpus filter vocabulary
- `2026-07-02-codebase-graphing-W04-P05-S10` - Dispatch the corpus parameter on /graph/query with typed validation for corpus-mismatched facets, as_of rejection, and the code branch riding the shared envelope, ceiling, and tiers block
- `2026-07-02-codebase-graphing-W04-P05-S11` - Serve the code facet vocabulary on /filters behind the corpus parameter
- `2026-07-02-codebase-graphing-W04-P05-S12` - Add wire conformance tests: rollup and file granularity through the shared envelope, vault-default unchanged, corpora never mix, typed error envelopes carry tiers, per-corpus vocabulary
- `2026-07-02-codebase-graphing-W05-P06-S13` - Run cargo fmt, clippy, and the workspace test suite to green across the touched crates
- `2026-07-02-codebase-graphing-W05-P06-S14` - Scan this repository with the release example and record extraction scale and accuracy counters
- `2026-07-02-codebase-graphing-W05-P06-S15` - Live-verify the served code corpus over a real socket serve: module rollup, scoped file descent, and per-corpus filters

### plan

- `2026-07-02-codebase-graphing-plan` - `codebase-graphing` plan

### research

- `2026-07-02-codebase-graphing-research` - `codebase-graphing` research: `mapping a codebase as a node network`
