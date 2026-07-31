---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:2175a4e54f81d1b2654208009ee524de5b1e5cb5f6d0a3e889fc73243b3ad8ba'
step_id: 'S19'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# add the rule node kind and its identity prefix

## Scope

- `engine/crates/engine-model/src/id.rs`

## Description

## Outcome

Added `NodeKind::Rule` and its `rule:` identity prefix plus the `CanonicalKey::Rule { slug }` form.

{OUTLINE}

## Notes
