---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S14'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Author machine-level lifecycle ActionDescriptors and render the host-level control with stop-is-machine-wide copy

## Scope

- `frontend/src/app/right/RagOpsConsole.tsx`

## Description

- Create `frontend/src/app/right/RagOpsConsole.tsx` with the `MachineServiceStrip`: the running-state dot (green running / warm-broken otherwise), `rag` + state Badge (running/crashed/absent from `useRagStatus`), pid·port (from `ops-state.qdrant`), and the machine-wide stop caption.
- Wire the machine lifecycle: Stop (danger) when running / Start (primary) when not, via `useRagServiceStart`/`useRagServiceStop` (which dispatch through the one ops seam - the unified action plane); surface the degraded reason from the tiers-derived status.

## Outcome

Done. The console's machine-level lifecycle control is built as glass (consumes stores hooks, no fetch), token-styled, kit-composed, with stop-is-machine-wide copy. `npx tsc --noEmit`, eslint, prettier, and `lint:px` are all clean on the touched files.

## Notes

The lifecycle verbs flow the action plane via the existing `useRagServiceStart/Stop` -> `dispatchOps` -> `appDispatcher` chain (per `unified-action-plane`); full ActionDescriptor/palette enrollment of the new machine verbs is a deferred enhancement (the command-palette already exposes start/stop). The crashed-vs-absent dot currently maps both non-running states to `bg-state-broken` with the word disambiguating; an amber `state-stale` tone for crashed is a noted polish item.
