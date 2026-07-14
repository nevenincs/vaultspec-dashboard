---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S247'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Resolve shared action presentation at React boundaries

## Scope

- Shared action and localization descriptor contracts
- Context menu, command palette, mobile chrome, dock, and provisioning action boundaries
- Canonical common action accessibility and unavailable-state messages
- Focused production-behavior tests and the exact localization allowlist

## Description

- Added transitional string-or-message action presentation support while preserving stable action IDs, execution lanes, eligibility, and existing legacy confirmation behavior.
- Added strict destructive and guarded typed confirmation descriptors with distinct catalog-key constraints and mutually exclusive legacy and typed confirmation fields.
- Added reactive message-result resolution that reports safe fallback use without exposing translation failures, keys, or diagnostics to users.
- Resolved labels, disabled reasons, legacy prompts, and full typed confirmations only at React rendering boundaries.
- Added a shared typed confirmation dialog and fail-closed behavior when any required presentation cannot be resolved safely.
- Kept command palette pending confirmation identity to the stable action ID, revalidated the current action before execution, and excluded disabled commands from pointer and keyboard activation.
- Preserved context-menu opener restoration, returned focus to the pending row on cancellation, and suspended viewport dismissal while confirmation is open.
- Replaced the provisioning action's armed English prompt with the catalog-owned confirmation message.

## Outcome

Shared action consumers can now accept typed localized presentation without moving translated strings into stores. Typed confirmations are bounded, catalog-owned, reactive to locale changes, and fail closed. Existing plain-string producers and two-activation legacy confirmations remain behaviorally compatible for the next migration step. Mobile action nodes use stable IDs as React keys, and palette filtering operates on resolved labels in the active locale.

The focused integration run passed 156 tests across 15 files. TypeScript compilation and the complete frontend lint recipe passed, including ESLint, formatting, localization scanning, pixel and module-size checks, token drift, and Figma naming. Migrating the provisioning confirmation prompt removed one stale scanner finding, reducing the exact baseline from 1,560 to 1,559.

## Notes

An independent Sol review confirmed that all six pre-commit findings were resolved and reported no remaining findings. The review found no new user-facing developer metadata, raw localization keys, diagnostics, or em dashes. The branded legacy presentation bridge remains intentionally deferred to `S246`; final removal of the bridge remains gated on producer migration through `S82`.
