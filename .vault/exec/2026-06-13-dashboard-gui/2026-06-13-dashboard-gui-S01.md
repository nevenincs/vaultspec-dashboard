---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-06-13-dashboard-gui-plan]]"
---

# Add granularity to the typed graph query and request feature granularity for the constellation

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the engine-owned `granularity` parameter (`document` | `feature`) to
  the typed graph query in the engine client, defaulting to `document`.
- Have the center-stage constellation request `feature` granularity so the
  top-level view consumes synthesized feature-convergence nodes rather than
  document nodes.

## Outcome

The typed client can request the constellation view; the stage no longer
silently falls back to a document-granularity query against the live origin.

## Notes

The parameter is forwarded verbatim and echoed in the normalized filter; the
engine owns validation (the client never guesses the enum).
