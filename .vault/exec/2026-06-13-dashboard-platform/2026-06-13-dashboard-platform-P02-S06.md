---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S06'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Wrap the four AppShell regions in region boundaries with designed fallbacks and ## Scope

- `frontend/src/app/AppShell.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Wrap the four AppShell regions in region boundaries with designed fallbacks

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Wrapped each of the four shell regions (left rail, stage, right rail, timeline) in
  its own `ErrorBoundary` with a matching `region` id.
- Placed a `CrashZone` inside each region boundary for dev adverse-condition injection,
  and mounted the dev `CrashInjector` panel in the shell.
- Kept the rail collapse toggles outside the boundaries so the chrome survives a content
  crash.

## Outcome

A thrown region renders its contained fallback while its sibling regions stay live - the
ADR D5 guarantee, now structural rather than aspirational. Full suite green, lint clean.

## Notes

Boundaries wrap region content, not the `aside` element, so rail collapse still works
when content crashes. No scaffolds left.
