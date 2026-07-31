---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:85c5bf7497aef997b004d847b17e53302115012d619a4613650f58ad214d8031'
step_id: 'S15'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# read the generated-by label from the exec id container path

## Scope

- `engine/crates/engine-query/src/ontology.rs`

## Description

## Outcome

Added `stem_is_exec_record` reading the W##/P##/S## (and -summary) container path; the exec container signal assigns generated-by, winning over heuristics.

{OUTLINE}

## Notes
