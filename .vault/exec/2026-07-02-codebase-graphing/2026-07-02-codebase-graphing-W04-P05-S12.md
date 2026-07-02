---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S12'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Add wire conformance tests: rollup and file granularity through the shared envelope, vault-default unchanged, corpora never mix, typed error envelopes carry tiers, per-corpus vocabulary

## Scope

- `engine/crates/vaultspec-api/tests/code_corpus.rs`

## Description

Add five router-level e2e conformance tests over a real polyglot fixture: rollup shape, file descent, vault/code disconnection both directions, typed error envelopes with tiers, per-corpus vocabulary.

## Outcome

5/5 green on first run.

## Notes
