---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S03'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

# Bridge scene-worker logs to the main logger and migrate the two worker console calls

## Scope

- `frontend/src/platform/logger/workerBridge.ts`

## Description

- Implemented `workerBridge.ts`: a `WORKER_LOG_TAG` envelope, `postWorkerLog`
  (worker-side poster), and `isWorkerLogEnvelope` (main-side type guard). The logger
  import is type-only, so the module carries no runtime logger dependency into the
  worker bundle.
- Migrated the in-worker `console.error` in `fa2.worker.ts` (duplicate-edge
  diagnostic) to `postWorkerLog` over the worker's `postMessage`.
- Wired the main-side `FieldLayout.onmessage` in `layoutWorker.ts` to peel log
  envelopes off the layout channel and re-emit them through `logger.ingest`.
- Migrated the main-thread `console.error` in `fieldAssembly.ts` (rejected-tier
  diagnostic) to `logger.child("scene.field-assembly").error`.

## Outcome

The two scattered scene `console.error` calls now flow into the shared ring buffer;
a repository grep confirms `console.*` survives only inside the platform
`ConsoleSink`. 4 unit tests plus the worker -> main round trip pass; `tsc -b` is
clean across the worker and scene edits.

## Notes

`workerBridge.ts` is deliberately runtime-logger-free (type-only import) so the FA2
worker bundle does not drag the root logger, its console sink, or its ring buffer
into the worker scope. The scene edits are cross-layer but downward (scene consumes
the platform substrate), which the layer-ownership boundary permits.
