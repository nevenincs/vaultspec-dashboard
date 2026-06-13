---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S02'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Install the global window.onerror and unhandledrejection traps routed to the logger and ## Scope

- `frontend/src/platform/logger/globalTraps.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Install the global window.onerror and unhandledrejection traps routed to the logger

## Scope

- `frontend/src/platform/logger/globalTraps.ts`

## Description

- Implemented `installGlobalTraps(win, log)`: registers `error` and
  `unhandledrejection` listeners on the window and routes each into the logger.
- Window error events attach the live Error (or a `{ message }` fallback); promise
  rejections serialize an Error reason as the record's error and carry a non-Error
  reason as fields.
- Made the installer idempotent (module guard) and return an `uninstall()` handle
  that removes both listeners.

## Outcome

`src/platform/logger/globalTraps.ts` is the last-resort net for failures that escape
React entirely - what an ErrorBoundary structurally cannot catch. 5 happy-dom tests
cover both event types, error-vs-fields routing, post-uninstall silence, and
idempotency - all green.

## Notes

The install is wired into the app root in `P02.S05` alongside the app-level boundary,
so the trap is live for the whole session. No scaffolds left.
