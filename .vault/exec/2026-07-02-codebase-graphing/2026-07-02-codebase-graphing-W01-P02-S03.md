---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S03'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Implement the bounded ignore-aware source walk with file-count and file-size caps and Cargo manifest collection

## Scope

- `engine/crates/ingest-code/src/walk.rs`

## Description

Implement the recursive bounded walk: dot-dirs (incl. `.vault`) skipped, always-ignore set + per-dir simple `.gitignore` names honored subtree-scoped, symlinked dirs never followed, sorted deterministic order, max-files/max-file-bytes caps with honest counters; collect Cargo manifests.

## Outcome

3 walk tests green (noise skipping, cap honesty, nested gitignore scoping).

## Notes
