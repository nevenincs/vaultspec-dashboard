---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:26efea4ebca37a06dbd88b5819291c103cce9b0ee108c877b0b10be7d28c46df'
step_id: 'S21'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# mint promoted-from derivation edges from rule back to its audit

## Scope

- `engine/crates/engine-graph/src/index.rs`

## Description

## Outcome

Minted `promoted-from` declared edges from each rule to its source audit (read from derived_from frontmatter or a backtick-quoted -audit stem), only when the audit node exists.

{OUTLINE}

## Notes
