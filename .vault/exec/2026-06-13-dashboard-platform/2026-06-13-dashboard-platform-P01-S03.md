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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Bridge scene-worker logs to the main logger and migrate the two worker console calls and ## Scope

- `frontend/src/platform/logger/workerBridge.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
