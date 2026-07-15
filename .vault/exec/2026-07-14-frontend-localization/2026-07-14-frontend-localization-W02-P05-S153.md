---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S153'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Standardize editor command builders on canonical document action verbs

## Scope

- Editor command builders, document catalogs, policy, localization tests, and scanner baseline.

## Description

- Move close, reload, and keep-open labels to typed document action descriptors.
- Preserve command IDs, families, order, shared actions, and callbacks.
- Verify exact descriptor identity and multilingual resolution.

## Outcome

Editor commands now share the document action vocabulary and contain no hot-typed English presentation strings.

## Notes

Behavioral and catalog tests passed without test doubles or duplicated business logic.
