---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S05'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Implement per-language import-path resolution over the walked set: Rust use/mod with workspace crate map, TS/JS relative probing with ESM js-to-ts swap, Python absolute/relative/submodule probing

## Scope

- `engine/crates/ingest-code/src/resolve.rs`

## Description

Implement resolution over the walked set only: Rust crate/self/super/workspace-crate longest-prefix probing with brace-group expansion; TS/JS relative probing incl. ESM .js→.ts swap and index files; Python ancestor-root + src-root probing with submodule names and external-vs-unresolved distinction.

## Outcome

6 resolver tests green. One real bug caught by tests: the root-file fallback fired on non-empty segment misses, false-resolving external crates to lib.rs — fixed by scoping the fallback to the empty-segment case.

## Notes
