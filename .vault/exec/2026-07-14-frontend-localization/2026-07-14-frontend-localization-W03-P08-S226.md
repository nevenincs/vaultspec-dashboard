---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S226'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize and localize vault-section menu actions without internal IDs

## Scope

- `frontend/src/app/left/menus/vaultSectionMenu.ts`

## Description

- Verified every action in the resolver is composed from shared, already-localized
  builders (`expandTreeAction`, `collapseTreeAction`, `sortTreeActions`,
  `resetSortingAction`, `toggleFacetsAction`, `resetFiltersAction`, `clearFilterAction`,
  `newDocumentAction`) rather than any menu-local English literal.
- Confirmed no internal ID, scope token, or entity-kind string is rendered as visible
  copy.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The vault-section menu resolves entirely through the shared localized action builders,
with no menu-local copy to migrate.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This resolver's localization
was inherited transitively from the shared action builders migrated under
`W02.P05.S22`-`S31`, not from a step-specific commit. This record retroactively
documents and ticks the plan step; verification was file inspection plus a scoped
scanner run, not a fresh implementation.
