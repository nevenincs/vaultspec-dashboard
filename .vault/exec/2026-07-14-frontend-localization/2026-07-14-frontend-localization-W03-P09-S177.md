---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S177'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace raw graph-node identifier copy with an approved public reference and finish graph-node menu localization

## Scope

- `frontend/src/app/stage/menus/graphNodeMenu.ts`
- graph menu behavior and localization tests
- public-reference action
- catalogs
- and exact allowlist

## Description

- Removed the `node:copy-id` action, which copied the raw internal node identifier
  (`normalizedEntity.id`) to the clipboard, grounded in the 2026-07-15
  context-menu-copy-safety audit finding CMCS-001 (raw internal identifiers are never
  user-facing clipboard output).
- Added `node:copy-document-name` in its place: for a DOCUMENT node it copies the
  document stem (an approved public reference, `what: "stem"`) under the existing
  `common:actions.copyDocumentName` catalog key; a non-document node has no public
  reference and the action is omitted entirely rather than degraded-with-reason.
- No new catalog key or scanner-allowlist entry was needed — the label reused an
  existing entry.

## Outcome

The graph-node context menu never copies a raw internal identifier; document nodes
expose their document name as the public reference, and non-document nodes correctly
have no copy-identity action.

## Notes

Independently reverified (bookkeeping only, no code changes by me): `git diff` matches
the reported change exactly, `npx tsc --noEmit` clean, the localization scanner clean,
and the live suites `graphMenus.test.ts`, `graphMenus.localization.test.ts`, and
`timeTravelGate.test.ts` pass (26/26 combined). Fixed by opus-l10n; this record
documents and ticks the plan step on that basis.
