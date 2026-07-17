---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S179'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Remove raw meta-connection identifier copy and finish connection menu localization

## Scope

- `frontend/src/app/stage/menus/metaEdgeMenu.ts`
- graph menu behavior and localization tests
- catalogs
- and exact allowlist

## Description

- Removed the `meta-edge:copy-id` action, which copied the raw internal meta-edge
  identifier (`normalizedEntity.id`) to the clipboard, grounded in the same
  context-menu-copy-safety audit finding CMCS-001 as `W03.P09.S177`.
- A meta-connection is a transient, aggregated ribbon with no user-level public
  reference, so the action is omitted entirely (no replacement copy verb) rather than
  degraded-with-reason; the existing `goto-src`/`goto-dst`/`copy-summary` actions are
  unaffected.
- No catalog or scanner-allowlist change was needed (a removal, not an addition).

## Outcome

The meta-edge context menu never copies a raw internal identifier.

## Notes

Independently reverified (bookkeeping only, no code changes by me): `git diff` matches
the reported change exactly, `npx tsc --noEmit` clean, the localization scanner clean,
and the live suites `graphMenus.test.ts`, `graphMenus.localization.test.ts`, and
`timeTravelGate.test.ts` pass (26/26 combined). Fixed by opus-l10n; this record
documents and ticks the plan step on that basis. This closes the P07/P09 portion of the
Wave-03 defect queue (S45, S112, S113, S162, S165, S171, S177, S179); `W03.P08.S174`
(a separate, still-open stale-test defect in `RailFilterField.render.test.tsx`,
predating this queue) remains outstanding, so Wave W03 is not yet fully green.
