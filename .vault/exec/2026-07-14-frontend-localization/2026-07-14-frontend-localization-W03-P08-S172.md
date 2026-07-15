---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S172'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize create-document dialog fields, validation, confirmations, and actions

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Replace static dialog copy, labels, hints, states, actions, and accessible names with
  typed localization descriptors.
- Preserve structured create failure kinds at the mutation boundary and map them to a
  closed set of actionable messages.
- Fail closed for unknown document types and refusal values without rendering backend
  reasons, diagnostics, paths, hashes, actors, or receipt identifiers.
- Add genuine English, French, and Arabic resources and remove the exact scanner baseline.

## Outcome

The create-document dialog is language agnostic and renders only localized, user-facing
copy. Same-day collisions, changed projects, changed locations, in-flight creation, and
generic failures provide truthful recovery guidance without exposing internal metadata.
Request payloads, focus behavior, accessibility relationships, and successful document
opening remain unchanged.

## Notes

One hundred three focused tests and the complete frontend lint recipe passed. Root and
Terra independently verified the result. Thirty-nine exact scanner rows were removed,
reducing the clean baseline from 1,024 to 985 findings.
