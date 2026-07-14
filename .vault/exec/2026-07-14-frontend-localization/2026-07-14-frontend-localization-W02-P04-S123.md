---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S123'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize shared chrome actions

## Scope

- Shared chrome and control-panel action descriptors
- Reactive control-panel state in the command snapshot
- Direct consumers, provider tests, and command-context fixtures
- The exact localization scanner baseline

## Description

- Replaced ten temporary English action labels with existing catalog descriptors.
- Standardized chrome actions on short commands: open, show, hide, enable, disable, and reset.
- Made control-panel labels state-aware without hidden store reads. Builders receive the current open panel explicitly, the status cluster passes its subscribed value, and the command palette carries the same value in its reactive command snapshot.
- Narrowed the control-panel provider to the one snapshot field it consumes.
- Added raw descriptor, state transition, provider, and real localization-runtime coverage.
- Removed synthetic reset-runner tests and their mock utilities from the touched suite.
- Preserved action IDs, icons, sections, ordering, execution, accelerator derivation, and reset-only time-travel gating.
- Removed exactly ten matching temporary bridge entries from the scanner allowlist.

## Outcome

Chrome actions now use consistent sentence-case catalog commands. Control-panel commands say Show or Hide from current state and refresh while the command palette is open, without exposing framework or implementation terminology.

The focused run passed 81 tests across 14 files. The complete frontend lint recipe passed, including localization scanning and TypeScript checks. The scanner baseline decreased from 1,516 to 1,506 findings, and the temporary action bridge decreased from 162 to 152 entries.

## Notes

Terra performed the bounded inventory and implementation. Sol rejected a proposed hidden store read and required explicit reactive state flow through the command context. The implemented architecture follows that decision, and Sol's final independent review reported no findings.
