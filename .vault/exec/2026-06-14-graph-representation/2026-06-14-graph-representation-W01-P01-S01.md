---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add salience optional float and embedding to EngineNode with integration-seam note

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

## Outcome

Added optional `salience` (per-lens float) and `embedding` (number[]) to `EngineNode` with integration-seam notes naming the graph-node-salience and graph-node-semantics producers. Typecheck green.

Added optional `salience` (per-lens float) and `embedding` (number[]) to `EngineNode` with integration-seam notes pointing at graph-node-salience and graph-node-semantics producers. Typecheck green.

## Notes
