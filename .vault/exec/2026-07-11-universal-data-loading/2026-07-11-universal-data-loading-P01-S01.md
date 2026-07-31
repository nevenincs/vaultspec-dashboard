---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
body_hash: 'sha256:fed0a5870c5d0e484731afbb86e158229e2af96f17cef4e23000358f5d2ea25e'
step_id: 'S01'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Create the bounded drain-progress slice: a zustand store keyed by listing id holding pagesLoaded/rowsLoaded/complete, entries pruned on settle or error, with a narrow write seam the wire client can call without importing chrome

## Scope

- `frontend/src/stores/server/drainProgress.ts`

## Description

Create `frontend/src/stores/server/drainProgress.ts`: a bounded zustand slice (`MAX_DRAIN_ENTRIES` = 8, oldest-evicted) keyed by listing id holding `pagesLoaded`/`rowsLoaded`; plain-function write seams `reportDrainProgress`/`settleDrainProgress` callable from the wire client without chrome or hook imports; pure `rollupDrainProgress` for the activity view's `useMemo` derivation.

## Outcome

Slice created with normalization (rejects malformed ids/counts), entries deleted on settle or error, bounded at creation per resource-bounds.

## Notes
