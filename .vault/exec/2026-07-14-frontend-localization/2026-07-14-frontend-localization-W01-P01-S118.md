---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S118'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Apply and reactively update document language and direction attributes

## Scope

- `frontend/src/platform/localization/documentLanguage.ts`

## Description

- Resolve one canonical document locale from the initialized runtime with a safe source-locale fallback.
- Apply only changed language and direction properties to the document root.
- Subscribe once per runtime and root pair with reference-counted, idempotent cleanup.
- Retain zero-reference binding ownership until exact listener removal succeeds.
- Reject internal language modes and contain failures without producing visible or diagnostic output.

## Outcome

The localization platform can now set the document language and writing direction before
the application mounts and keep both values synchronized after real language changes.
Weak ownership prevents the binding registry from retaining runtimes or document roots,
while exact listener cleanup supports repeated bind and release calls safely. A bounded
removal retry keeps transient failures recoverable, and a later bind reuses the owned
listener instead of registering a duplicate.

## Notes

Real `i18next` and browser-document assertions covered left-to-right and right-to-left
updates, redundant-mutation avoidance, internal-mode fallback, shared ownership, and
listener release. The temporary verification file was removed after it passed. Targeted
Prettier, ESLint, and strict TypeScript checks passed. Remediation also repeated real
runtime reference-count and listener-release coverage after preserving failed-removal
ownership.
