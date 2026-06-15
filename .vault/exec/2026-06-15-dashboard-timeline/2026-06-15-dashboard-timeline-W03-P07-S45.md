---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S45'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S45 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Retain and adapt event selection through the shared selection with a bounded node_ids pulse and ## Scope

- `frontend/src/app/timeline/eventSelection.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
