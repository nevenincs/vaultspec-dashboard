---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

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
