---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S07'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Add the dev-only crash-injection affordance for adverse-condition testing and ## Scope

- `frontend/src/platform/errors/CrashInjector.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the dev-only crash-injection affordance for adverse-condition testing

## Scope

- `frontend/src/platform/errors/CrashInjector.tsx`

## Description

- Implemented `useCrashStore` (Zustand) with `arm`/`disarm`/`disarmAll` per region.
- Implemented `CrashZone` (throws when its region is armed, renders null otherwise) and
  the dev-only `CrashInjector` floating panel (an arm button per region plus clear),
  which renders nothing in a production build.

## Outcome

Every region boundary is now reachable live without waiting for a real bug. 5 tests
cover the store transitions, `CrashZone` null-vs-throw, and the panel arming a region's
flag.

## Notes

Mirrors the degradation debug switch (ADR D5). "clear" disarms so a boundary retry can
demonstrate recovery rather than re-throwing immediately. No scaffolds left in shipped
paths (the injector is dev-gated).
