---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S09'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Add the hidden-tab pause to the backends+git signal stream: after a document.hidden grace window close the subscription, resubscribe and re-snapshot on visibilitychange, with Status readers never reading the pause gap as degradation and the graph SSE untouched

## Scope

- `frontend/src/stores/server/queries.ts (useBackendSignalStream) + frontend/src/stores/view/backendSignals.ts`

## Description

Add the hidden-tab pause in `frontend/src/stores/server/queries.ts`: `useDocumentHiddenPause` (60s grace on `document.hidden`, instant resume on visible) gates `useBackendSignalStream` via `enabled`; pausing also cancels the stream key (closing the EventSource - enabled:false alone leaves it open, cancel alone would let retry reconnect); resume invalidates the key so the re-enabled observer reopens and re-snapshots. Updated the `refetchType: active` contract comment to name this sanctioned surface.

## Outcome

The one always-on SSE now parks with the tab; the graph delta channel untouched (mount-gated, seq-anchored). Status readers see a designed resume, not a lost-stream error.

## Notes
