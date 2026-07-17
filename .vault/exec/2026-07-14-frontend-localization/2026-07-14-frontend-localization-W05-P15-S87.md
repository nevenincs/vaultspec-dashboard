---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S87'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace bundled language, code-fence, and badge display names with locale catalog mappings

## Scope

- `frontend/src/app/viewer/languages.ts`

## Description

- Verified the module resolves every bundled language, code-fence, and badge display
  name through typed message-key descriptors (237 sites, one per supported language),
  never a raw literal.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The bundled language vocabulary is fully catalog-driven.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`5eef2d0599` ("i18n(frontend): migrate UI surfaces to the localization catalog"),
following the earlier language-coverage expansion in `fa00791823`. This record
retroactively documents and ticks the plan step; verification was file inspection plus
a scoped scanner run, not a fresh implementation.
