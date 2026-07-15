---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S06'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---




# Extend the fs-list wire types and useFsList seam with q and hidden params, the enriched entry fields, the places block, placeholderData keepPreviousData, and a typed add_workspace refusal reason on the engine client error surface, with stores tests

## Scope

- `frontend/src/stores/server (engine.ts`
- `queries/fsBrowse.ts`
- `queries/workspaces.ts)`

## Description

- Extend `FsListEntry` with `is_hidden` / `is_registered`, add `FsPlace` and the response `places` block, and add `FsListParams` (`path`, `q`, `hidden`) to the wire types
- Teach the tolerant `adaptFsList` adapter the new fields, defaulting safely for a pre-enrichment engine
- Extend `engineClient.fsList` to carry the `q` and `hidden` request params
- Widen the `engineKeys.fsList` cache key to (path, q, hidden) so each narrowing is its own bounded entry
- Rework `useFsList` to a params object with `placeholderData: keepPreviousData` so level navigation never flashes to a skeleton (ADR D2)
- Extend the live-wire tests: enriched entry fields and places on the roots read, an engine-side `q` narrow (filtering law), and per-param cache-key distinctness

## Outcome

The stores seam serves the full ADR D4 projection. No new typed-error plumbing was needed: `add_workspace` refusals ride the existing `EngineError.errorKind` convention, consumed by `classifyAddWorkspaceError` (which replaced the message-regex mapper).

## Notes

- The parallel localization campaign was live in the same files throughout this phase; work was continuously reconciled against their edits (they adapted their migration to this new seam within minutes of it landing).
