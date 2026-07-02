---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S04'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Author per-language import queries and the query-driven extractor with compiled-query caching and Python from-name walking

## Scope

- `engine/crates/ingest-code/src/extract.rs`

## Description

Author `rust.scm` (use + out-of-line mod), shared `typescript.scm` (import/export-from/require/dynamic import) and `python.scm` (absolute, aliased, from, relative) with a per-grammar compiled-query cache; walk from-statement names in code.

## Outcome

5 extraction tests green; every query compiles against its real grammar (gate-pinned in lang tests); broken files degrade to zero imports, never errors.

## Notes
