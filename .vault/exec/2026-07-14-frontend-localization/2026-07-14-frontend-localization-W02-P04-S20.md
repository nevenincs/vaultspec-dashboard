---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S20'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize the shared open-entity action once

## Scope

- The shared open-entity action builder
- Its search-result caller and shared/right-menu tests
- The exact localization scanner baseline

## Description

- Removed caller-owned label and disabled-reason string overrides from `OpenEntityOptions`.
- Assigned `common:actions.open` as the shared action label.
- Assigned the actionable `common:disabledReasons.selectItemToOpen` message when no node can be opened.
- Removed the search-result caller's `no graph node` override so the builder is the only presentation authority.
- Added raw descriptor assertions and real localization-runtime resolution coverage.
- Preserved the action ID, node and scope normalization, run behavior, navigate section, icon, and non-mutating eligibility.
- Removed exactly three stale legacy action-presentation entries with no new or mismatched scanner findings.

## Outcome

Every consumer of the shared open-entity builder now receives the same catalog-owned `Open` action and clear recovery message. The scanner baseline decreased from 1,522 to 1,519 findings, and the temporary action bridge decreased from 168 to 165 entries.

The focused run passed 50 tests across three files. The complete frontend lint recipe passed ESLint, localization scanning, formatting, TypeScript, pixel and module-size checks, token drift, and Figma naming.

## Notes

This step intentionally did not change the relate, repair, or archive builders in the same file; they remain tracked by `S148`, `S149`, and `S150`. An independent Sol review reported no findings and confirmed exact scope, behavioral preservation, exact scanner shrinkage, real-runtime tests, and no new user-facing metadata, raw keys, diagnostics, or em dashes.
