---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S16'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement extractors for file paths, canonical step identifiers, wiki-link stems and code symbols, each recording byte-span provenance

## Scope

- `engine/crates/ingest-struct/src/extract.rs`

## Description

- Implement the four extractors over document bodies: wiki-link stems from double-bracket spans (alias form supported); paths, canonical step identifiers and code symbols from inline backtick code spans; fenced code blocks treated as opaque.
- Record byte-span provenance on every mention; deterministic single-pass scanning, no regex dependency.

## Outcome

Deterministic extraction per ADR section 3 v1 scope: paths and step ids exact, symbols by qualified name; spans point at the exact mention text (verified by test).

## Notes

Precision-over-recall call: backtick code spans are the extraction channel for paths/steps/symbols because this vault's own LINK RULES mandate exactly that convention; bare prose tokens are not extracted in v1. Recorded for phase review.
