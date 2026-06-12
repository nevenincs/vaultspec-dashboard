---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S17'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the working-tree resolver assigning resolved, stale or broken state to every structural edge, retaining broken edges

## Scope

- `engine/crates/ingest-struct/src/resolve.rs`

## Description

- Implement the working-tree resolver assigning resolved, stale or broken to every mention, retaining broken mentions (ADR D3.3).
- v1 semantics: resolved = exact target present; stale = same-named candidate elsewhere (moved file) or undecidable context (no plan corpus for a step id); broken = nothing resolves.
- Per-kind rules: paths by existence with basename fallback; wiki stems against the vault tree; step ids against plan documents' canonical backtick form; symbols by qualified-name text match over code files with last-segment fallback to stale.

## Outcome

Every structural mention carries a state and, where found, a resolved target - the data the structural tier's status-colored rendering needs.

## Notes

Stale is defined working-tree-verifiably (moved-candidate / undecidable) rather than historically (requires the cache, a W02 concern). Symbol resolution is text-match per the ADR's explicit v1 bound; tree-sitter is v2.
