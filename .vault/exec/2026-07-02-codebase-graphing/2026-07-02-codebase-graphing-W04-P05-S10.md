---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S10'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Dispatch the corpus parameter on /graph/query with typed validation for corpus-mismatched facets, as_of rejection, and the code branch riding the shared envelope, ceiling, and tiers block

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

Dispatch corpus on /graph/query: vault default byte-identical (corpus field absent), code branch via spawn_blocking ensure_fresh, same envelope/ceiling/tiers, typed 400s for unknown corpus, vault-filter-on-code, code-facets-on-vault, and as_of-on-code.

## Outcome

Field-set parity with the vault response plus additive corpus/extraction/code_generation fields.

## Notes
