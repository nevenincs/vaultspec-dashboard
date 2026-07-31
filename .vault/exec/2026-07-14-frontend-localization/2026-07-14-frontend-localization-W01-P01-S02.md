---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
body_hash: 'sha256:28b00e0117d6d7f4c0701ac2d6aafd5250791083ba33df585da48b76da45da81'
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

Review aligned the generic page-recovery message with the canonical `Reload` verb used
by the shared page action and unexpected-application recovery message.

The source catalog now owns a dedicated `destructiveActions` category. Its typed keys
form the allowlist for explicit destructive confirmation labels, beginning with
`discardChanges`.
