---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S45'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Retain and adapt event selection through the shared selection with a bounded node_ids pulse

## Scope

- `frontend/src/app/timeline/eventSelection.ts`

## Description

- Add a `handleNodeClick(node, arcs, scene)` path that selects a lineage
  (document) mark through the ONE shared `Selection` via `selectNode` (the node id
  `doc:{stem}` is itself a graph node id) and pulses its bounded join set on the
  stage.
- Add a pure `joinedNodeIds(nodeId, arcs, max)` helper computing the node plus its
  1-hop lineage-arc neighbors, deduped with the node first, capped at
  `MAX_PULSE_NODE_IDS` (20, the contract truthfulness bound) and reporting the
  dropped count so truncation is stated, never silent.
- Retain `handleEventClick` unchanged so the concurrent context-menu resolver
  (`menus/eventMarkMenu`, the event-entity work) and any deprecated event-mark
  wiring stay compatible; it selects as an `event` and pulses the carried
  `node_ids`.
- Extend `eventSelection.test.ts` with the node-click path (shared `node` selection
  + bounded ego pulse) and the `joinedNodeIds` cap/dedup behavior, keeping the
  event-path and truncation assertions verbatim.

## Outcome

Lineage-node selection is emitted (not owned) through the shared `Selection`
concept with a bounded, truncation-honest `node_ids` pulse on the stage; the event
path and its context-menu compatibility are preserved. Gate green scoped to the
file (eslint, prettier, tsc, vitest).

## Notes

The Timeline-to-`handleNodeClick` wiring is left to the AppShell integration phase
(W05.P10); this step delivers and tests the selection module the surface emits
through, matching the prop-driven emit-intent-up layer pattern.
