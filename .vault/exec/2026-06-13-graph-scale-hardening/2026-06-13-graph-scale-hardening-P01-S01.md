---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S01'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Thread a once-built worktree inventory into resolution

## Scope

- `engine/crates/ingest-struct/src/resolve.rs`

## Description

- Introduced a `Resolver` struct built ONCE per index pass: one tree `walk` and
  one shared file-content cache, held across every document's mentions.
- Changed `index_documents` to construct the resolver before the document loop
  and reuse it, instead of calling the free `resolve(root, mentions)` per
  document (which re-walked the whole tree and re-read the whole codebase each
  time).
- Kept the free `resolve(root, mentions)` as a thin wrapper (`Resolver::new(root)
  .resolve(mentions)`) so the resolver tests and any other caller are unchanged.

## Outcome

The per-document full-tree walk and per-document codebase re-read are gone. Cold
index at 4000 docs dropped from 601s to 6.3s. The `all_three_states_assigned_
across_all_four_extractors` resolver test stays green — identical resolution
states, proving the change is behavior-preserving.

## Notes

A residual super-linearity remained after this step (symbol resolution still
scanned all code files per mention); it is addressed in S02 by memoization. The
shared cache eliminated the repeated file I/O; the residual was repeated
in-memory scanning.
