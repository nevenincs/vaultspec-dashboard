---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S05'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S05 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Mount the app-level boundary as the last line in the app root and ## Scope

- `frontend/src/main.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Mount the app-level boundary as the last line in the app root

## Scope

- `frontend/src/main.tsx`

## Description

- Wrapped the app root (the `QueryClientProvider` + `RouterProvider` tree) in
  `ErrorBoundary region="app" variant="app"` as the last line inside `StrictMode`.
- Called `installGlobalTraps()` before render so window `error` and
  `unhandledrejection` route into the logger for the whole session.

## Outcome

A throw that escapes every region boundary now degrades to a full-screen recoverable
fallback instead of a blank white screen. Full suite green after the change.

## Notes

The boundary sits inside `StrictMode` but outside `QueryClientProvider`, so a
provider-level throw is still contained. No scaffolds left.
