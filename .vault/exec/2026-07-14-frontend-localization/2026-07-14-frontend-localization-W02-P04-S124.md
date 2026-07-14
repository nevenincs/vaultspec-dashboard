---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S124'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize project actions

## Scope

- Shared project action descriptors
- Project action and keybinding invariant tests
- The exact localization scanner baseline

## Description

- Replaced the add-project action label with `projects:actions.add`.
- Replaced the project navigator action label with `projects:actions.switch`.
- Replaced the clear-history action label with `projects:actions.clearHistory`.
- Removed the temporary action-presentation bridge import and unused clear-history label constant.
- Preserved the two string-typed keybinding labels, group, IDs, chords, and context for the typed keybinding contract migration in `S22`.
- Added exact descriptor, icon, section, keybinding, and real localization-runtime coverage for project navigation.
- Removed the synthetic clear-history callback test instead of substituting a fake or unrelated function for the real recents integration.
- Removed exactly three matching temporary bridge entries from the scanner allowlist.

## Outcome

Project actions now use concise sentence-case catalog commands: Add project, Switch project, and Clear project history. No implementation terminology is exposed.

The focused run passed 11 tests across three files. The complete frontend lint recipe passed, including localization scanning and TypeScript checks. The scanner baseline decreased from 1,506 to 1,503 findings, and the temporary action bridge decreased from 152 to 149 entries.

## Notes

Two keybinding presentation findings intentionally remain in this file for `S22`, which owns the typed keybinding message contract. Terra performed the bounded migration. Sol approved the sequencing, rejected the synthetic clear-history callback test, and reported no findings after remediation.
