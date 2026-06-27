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
