---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S02'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Create the English namespace catalogs and typed resource aggregate

## Scope

- `frontend/src/locales/en/`

## Description

- Define dependency-free English catalogs for shared recovery actions and safe error
  messages.
- Aggregate source-locale namespaces as literal TypeScript resources.
- Export the source locale and default namespace for runtime initialization and typed
  message-key derivation in later steps.

## Outcome

The source locale now exposes `common` and `errors` namespaces through one immutable
resource aggregate. The catalogs establish semantic keys without using English as
identity and provide safe generic recovery copy without importing the localization
runtime, React, or store modules.

## Notes

Leaf-domain messages remain intentionally absent. Their owning migration steps will add
them after the shared message contract is available.
