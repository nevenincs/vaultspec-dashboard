---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S148'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize the shared relate action

## Scope

- The shared relate-to-selection action builder
- Its graph and document-menu composition
- Relate descriptor, localization-runtime, and menu tests
- The exact localization scanner baseline

## Description

- Replaced the relate label with `documents:actions.linkToSelectedDocument`.
- Replaced source and target type-state messages with the actionable `documents:disabledReasons.selectDocument` guidance.
- Replaced the same-document message with `documents:disabledReasons.selectDifferentDocument`.
- Removed caller-owned disabled-reason ingress and the graph caller's English override.
- Preserved branch precedence, caller-scoped IDs, Link icon, transform section, time-travel gate, dispatch-only shape, relation payload bytes, and null scope handling.
- Added raw descriptor and real localization-runtime coverage without introducing effect substitutes.
- Removed exactly four matching temporary bridge entries from the scanner allowlist.

## Outcome

Every relate action now uses the same catalog-owned command and clear selection guidance. No node-type, focus-state, or implementation terminology is shown.

The focused run passed 76 tests across five files. The complete frontend lint recipe passed, including localization scanning and TypeScript checks. The scanner baseline decreased from 1,501 to 1,497 findings, and the temporary action bridge decreased from 147 to 143 entries.

## Notes

Four shared-action bridge entries intentionally remain for the separately tracked autofix and archive builders in `S149` and `S150`. Terra performed the bounded migration, and Sol's independent review reported no findings.
