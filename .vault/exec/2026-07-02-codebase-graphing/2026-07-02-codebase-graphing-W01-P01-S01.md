---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S01'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Add NodeKind::CodeModule, CanonicalKey::CodeModule (wire prefix code-mod), RelationKind::Imports, and Provenance::TreeLayout with serde and as_str coverage plus id-form tests

## Scope

- `engine/crates/engine-model/src`

## Description

Add the four additive contract items to the model crate: CodeModule kind, code-mod canonical key, imports relation, tree-layout provenance; pin wire forms with tests.

## Outcome

Landed in `engine-model` `lib.rs`/`id.rs`; 11 crate tests green incl. 3 new pins (`code-mod:{dir}`, `imports`, `code-module`). Workspace compiled with zero broken matches (all matches were non-exhaustive-safe).

## Notes
