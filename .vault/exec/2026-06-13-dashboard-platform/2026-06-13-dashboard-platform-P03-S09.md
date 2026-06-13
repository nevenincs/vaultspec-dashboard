---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S09'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S09 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Implement the logging, tracing, and arm-to-confirm guard middlewares and ## Scope

- `frontend/src/platform/dispatch/middleware.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the logging, tracing, and arm-to-confirm guard middlewares

## Scope

- `frontend/src/platform/dispatch/middleware.ts`

## Description

- Implemented `loggingMiddleware`: logs every dispatched action at debug and logs +
  re-throws a handler failure (observable, never swallowed).
- Implemented `traceMiddleware`: stamps a monotonic trace id and timestamp into
  `meta` so a log line correlates to its dispatch.
- Implemented `createConfirmGuard`: arm-to-confirm generalized from the ops rail - an
  action with `meta.guard === "confirm"` arms on first dispatch (returns an
  `ArmedResult`, effect withheld) and fires on the second; exposes `isArmed`, `disarm`,
  and `reset`.
- Wired `createAppDispatcher` / the `appDispatcher` singleton with trace -> log ->
  guard, and exported the shared `appConfirmGuard`.

## Outcome

8 tests cover action logging, log-and-rethrow on failure, monotonic trace ids, the
two-step guard (arm then fire), guarded-vs-unguarded passthrough, reset, and the wired
app dispatcher. Typecheck and lint clean.

## Notes

Middleware order is trace (outermost, stamps meta) -> logging (logs the traced action,
catches handler throws) -> guard (innermost, short-circuits before the effect). Added
`disarm(type)` so the hook-level cancel does not desync from the guard's armed set.
