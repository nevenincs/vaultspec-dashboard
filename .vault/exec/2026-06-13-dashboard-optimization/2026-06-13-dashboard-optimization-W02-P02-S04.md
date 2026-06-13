---
tags:
  - '#exec'
  - '#dashboard-optimization'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S04'
related:
  - "[[2026-06-13-dashboard-optimization-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-optimization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-06-13-dashboard-optimization-plan placeholders are machine-filled by
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
     The Add a shared trailing-edge debounce and coalesce the graph and status invalidation storms and ## Scope

- `frontend/src/stores/server/graphSync.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a shared trailing-edge debounce and coalesce the graph and status invalidation storms

## Scope

- `frontend/src/stores/server/graphSync.ts`

## Description

- Added a substrate trailing-edge `debounce(fn, ms)` primitive (`platform/timing.ts`) with
  `cancel()` for teardown; tested under a 200-call storm (collapses to one trailing call),
  multi-burst, and cancel.
- Coalesced the two invalidation storms: `graphSync.useGraphLiveSync` now debounces the
  constellation invalidation (150ms, scope-keyed) - the cheap signals (lastSeq, connection)
  stay immediate; `NowStrip` debounces the `/status` recovery invalidation likewise
  (P-HIGH-1/2).
- Updated the affected tests to be timer-aware: the graphSync test asserts the invalidation
  is debounced (not fired until the window elapses), and the NowStrip test spaces its pushes
  beyond the debounce so each settles.

## Outcome

A delta/event burst now costs one trailing refetch, not one per delta with multiplicative
fan-out. The `debounce` util is reusable substrate. Suite green (348), typecheck + lint
clean.

## Notes

The graphSync/NowStrip debouncers are `useMemo`'d on a stable dep and cancelled on unmount,
so no leaked timers. The coalescing-under-storm property is pinned at the `debounce` util
level (200 -> 1); the hook tests pin that each hook routes through the debounce. Codify
candidate `burst-invalidations-coalesce` (ADR), deferred.
