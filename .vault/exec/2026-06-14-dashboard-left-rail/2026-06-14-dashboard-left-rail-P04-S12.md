---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Render the uniform four honest states across rail surfaces

## Scope

- `frontend/src/app/left/`

## Description

- Render the uniform four honest states across rail surfaces: loading, empty, degraded (read through the stores tiers selector), and error, plus a distinct vault filter-empty state.

## Outcome

The four honest states render uniformly; the vault browser gains a distinct filter-empty state separate from no-documents.

## Notes

WorkspacePicker, WorktreePicker, VaultBrowser, and CodeTree each already render the four states; the new filter-empty state is additive and committed in VaultBrowser.
