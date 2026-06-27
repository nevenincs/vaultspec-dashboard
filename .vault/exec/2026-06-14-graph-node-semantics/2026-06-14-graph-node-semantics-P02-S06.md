---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# parse the audit worst-finding severity into a lifecycle max_severity

## Scope

- `engine/crates/engine-graph/src/index.rs`

## Description

## Outcome

Added `audit_max_severity` returning the worst finding severity (critical/high/medium/low) as the audit lifecycle state, degrading to None honestly.

{OUTLINE}

## Notes
