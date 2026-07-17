---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S183'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize connection menu actions without node, ID, or JSON vocabulary

## Scope

- `frontend/src/app/right/menus/edgeMenu.ts`

## Description

- Verified every action label and disabled reason resolves through a typed message-key
  descriptor (`common:actions.highlightOnStage`, `common:actions.goToDestinationNode`,
  `common:actions.copy`, `common:disabledReasons.noDestinationNode`,
  `common:disabledReasons.noRelation`, `common:disabledReasons.noDestination`) or the
  shared `copyAction` builder, never a raw English literal.
- Confirmed no visible label names "node", "ID", or "JSON" — the full-record copy
  action serializes structured data as the copy payload (not display text) under the
  same generic `common:actions.copy` label as the other copy actions.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.
- Ran the live `rightMenus.test.ts` suite: it surfaced one stale assertion (expects a
  raw string `disabledReason` where the resolver now correctly returns a typed key
  descriptor) — a test-only defect reported separately under `W04.P10.S185`, not a
  defect in this file.

## Outcome

The connection (edge) menu renders only localized, typed-descriptor copy with no
internal-vocabulary leakage.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"), building on the earlier
`fca95b4c66` ("feat(localization): migrate clipboard action language") shared-builder
migration. This record retroactively documents and ticks the plan step; verification
was file inspection, a scoped scanner run, and a live focused-test run, not a fresh
implementation.
