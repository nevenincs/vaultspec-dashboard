---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S09'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Adapt settings wire types and selectors to expose locale identity without serving resolved English

## Scope

- `frontend/src/stores/server/engine/statusTypes.ts`
- `frontend/src/stores/server/liveAdapters/session.ts`
- `frontend/src/stores/server/settingsSelectors.ts`

## Description

- Replace resolved settings copy with bounded semantic group, field, and enum identities.
- Normalize the exact legacy schema into the same semantic shape without retaining English.
- Add the global language preference selector without moving write authority out of the engine.
- Reject malformed, unknown, or structurally inexact setting definitions.
- Bound schema input, metadata, and accumulator sizes at the adapter boundary.
- Exclude programmatic graph and activity-section settings from dialog groups.

## Outcome

Settings state now carries stable presentation identity only. The adapter accepts the
known semantic contract and an exact legacy compatibility signature, drops unsafe or
unknown definitions, and never manufactures labels from raw keys, groups, or values.
Language resolves as `system`, `en`, or the safe source-locale result after authoritative
state loads, without rewriting persistence.

## Notes

Independent Terra review found and verified fixes for hidden-control downgrade, resource
bounds, and exact boolean scope admission. Forty-eight focused tests passed against the
real engine. TypeScript, targeted ESLint, Prettier, localization scanning, and diff checks
passed. The scanner remained clean at 1,151 findings with no allowlist change.
