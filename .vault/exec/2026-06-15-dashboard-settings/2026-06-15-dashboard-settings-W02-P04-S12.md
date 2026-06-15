---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S12'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---




# Add the effective-value selector resolving scoped-then-global with default fallback and provenance over schema and values

## Scope

- `frontend/src/stores/server/settingsSelectors.ts`

## Description

- Created `settingsSelectors.ts`: `resolveEffective` (scope > global > default with provenance), `resolveSettings` (schema-ordered grouping), and `decodeBool`/`decodeInt` helpers.

## Outcome

Provenance-aware effective-value resolution as pure stores selectors.

## Notes

