---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:9bbbb16d67b667c78f8a837bbc45ad9bc6d4cff613818d494a2128a477441d8e'
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
