---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S07'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Prove runtime initialization, descriptor resolution, formatting, missing-key safety, and locale reactivity with production resources

## Scope

- `frontend/src/platform/localization/*.test.tsx`

## Description

- Prove synchronous initialization and resource isolation with real runtime instances.
- Exercise bounded descriptor normalization, interpolation, and safe fallback behavior.
- Verify every locale-explicit formatter and its invalid-input boundaries.
- Render the production provider and prove first-render and language-change behavior.
- Verify document language, direction, reactivity, reference counting, and cleanup.
- Exercise resource lifecycle isolation, hostile inputs, catalog nesting, and
  translation-like user values.

## Outcome

The localization substrate now has direct real-behavior coverage for its runtime,
descriptors, fallback boundary, formatters, React integration, and document metadata.
Visible fallback samples reject raw keys, unresolved interpolation, em dashes, and
implementation vocabulary. React reactivity uses a normally initialized real test
runtime without changing production singleton state or configuration.

## Notes

The three targeted suites passed with 16 tests. The full frontend lint gate and
TypeScript build check also passed.
