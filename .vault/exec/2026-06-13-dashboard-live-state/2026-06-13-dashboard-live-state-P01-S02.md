---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S02'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-live-state with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-06-13-dashboard-live-state-plan placeholders are machine-filled by
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
     The Throw StreamLostError on an abnormal stream close or non-ok response in the SSE consumer and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Throw StreamLostError on an abnormal stream close or non-ok response in the SSE consumer

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Replaced the bare `Error` in `sseChunks` with the platform-owned `StreamLostError` on
  a non-ok stream response and on a mid-stream read failure (ADR D2), so the failure
  policy classifies it `degraded`/`stream-lost`.
- A clean end-of-stream (`done`) still returns normally - it is not a lost stream.
- An intentional abort (unmount / scope change → `AbortError`) is re-thrown untouched, so
  a deliberate cancel never masquerades as a dropped stream.

## Outcome

The stream consumer now signals a lost stream truthfully. 2 new tests assert
`StreamLostError` on a 503 stream response and on a body that errors mid-read; the two
existing happy-path stream tests (since= replay, channel filtering) stay green.

## Notes

`isAbort` keys on `error.name === "AbortError"` to separate a cancel from a drop - the
streamed-query passes an abort signal on teardown, and that path must not flip the
degradation surface. `queries.ts` importing `StreamLostError` is stores -> platform
(downward), which the layer boundary permits.
