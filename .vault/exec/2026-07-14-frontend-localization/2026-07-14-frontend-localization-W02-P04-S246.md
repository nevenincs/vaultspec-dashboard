---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S246'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Introduce the exact legacy action-presentation bridge

## Scope

- The shared action presentation contract and platform action builders
- Every compiled application and store producer of legacy action labels and disabled reasons
- Localization scanner enforcement, adverse fixtures, tests, and the exact baseline
- Palette projection types affected by separating raw and resolved action presentation

## Description

- Added a bounded nominal `LegacyActionPresentation` string and the sole scanner-visible `legacyActionPresentation` factory.
- Narrowed `ActionPresentation` to the branded bridge or a typed `MessageDescriptor`, making plain strings fail at typed producer sites.
- Preserved the existing runtime string representation while rejecting empty, oversized, non-string, and invalid bridge data through normalization and safe fallback behavior.
- Wrapped every compiled legacy action label and disabled reason at its complete-message authoring boundary without changing visible copy, stable IDs, execution lanes, eligibility, or confirmation behavior.
- Added a dedicated `legacy-action-presentation` scanner rule resolved by canonical symbol provenance, including direct aliases, barrel re-exports, immutable local aliases, and dynamic arguments.
- Kept counterfeit helpers and unresolved branded-returning indirection visible as `presentation-field` findings.
- Replaced only the affected exact baseline entries: 205 stale generic presentation entries were removed and 201 dedicated bridge entries were added.
- Generalized palette time-travel and accelerator helpers over the raw or resolved command shape while keeping activation and armed repair on resolved commands.

## Outcome

All remaining English action presentation is now explicit, bounded migration debt. The scanner reports exactly 201 bridge uses, and each future producer migration removes one exact finding and baseline entry. Raw action strings cannot compile at typed producer sites, while symbol or type-provenance enforcement prevents aliases and lookalike helpers from hiding legacy copy. Existing action rendering and behavior remain unchanged.

The integrated run passed 339 tests across 30 files, including scanner, action normalization, context menu, command palette, keymap, mobile, menu, provisioning, and reader behavior. The remediated scanner suite passed all 10 adverse cases. The complete frontend lint recipe passed ESLint, localization scanning, formatting, TypeScript, pixel and module-size checks, token drift, and Figma naming. The exact scanner baseline decreased from 1,559 to 1,555 findings and now contains 201 dedicated legacy action findings.

## Notes

An independent Sol review found one pre-commit scanner bypass through an immutable local factory alias. The scanner now follows bounded, cycle-safe const aliases to the canonical factory and fails unresolved branded-returning calls as generic presentation findings. Sol re-reviewed the remediation and reported no remaining findings. The bridge is temporary: producer-localization steps must shrink its exact count, and `S17` cannot remove it until all action producers through `S82` have migrated.
