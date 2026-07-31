---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:9de7a10949851499b25471e893544979b2da02c02d9a4ef6a38241dcafa7dd1c'
step_id: 'S03'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# wire authority_class into the node_view document projection

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

## Outcome

Wired `authority_class` into `node_view` via `authority_class_for_kind` so every served document node carries the additive register field; the section-4 fields are retained verbatim.

{OUTLINE}

## Notes
