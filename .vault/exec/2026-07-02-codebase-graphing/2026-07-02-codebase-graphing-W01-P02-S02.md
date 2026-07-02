---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S02'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Scaffold the workspace crate with tree-sitter plus Rust/TypeScript/JavaScript/Python grammar dependencies and the CodeGraphData output type

## Scope

- `engine/crates/ingest-code`

## Description

Scaffold the crate with tree-sitter 0.26.10 + rust/typescript/javascript/python grammar crates; register in workspace deps.

## Outcome

Crate builds clean under the workspace `forbid(unsafe_code)`; grammar C compilation verified on MSVC (~36s cold).

## Notes
