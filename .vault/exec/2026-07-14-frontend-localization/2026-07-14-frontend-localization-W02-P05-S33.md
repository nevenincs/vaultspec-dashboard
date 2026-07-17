---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S33'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize the keyboard shortcuts dialog

## Scope

- The shortcut store projection and tests
- The keyboard shortcuts dialog and render tests
- Common English catalog, message policy, and alternate-locale test resources
- The exact localization scanner baseline

## Description

- Carry normalized label and group presentations through the shortcut view model without resolving locale copy in the store.
- Add stable action IDs to rows and collision-safe semantic IDs to groups.
- Preserve first-seen group and row order, effective chords, overrides, and keycap display.
- Resolve legacy copy and typed descriptors through the shared localization runtime during React render.
- Use stable group, action, and keycap identities for React keys across locale changes.
- Replace the dialog title and description with concise sentence-case catalog messages.
- Prove reactive locale changes, stable DOM identity, malformed-presentation rejection, and legacy-to-typed identity separation with real production behavior.
- Remove the two superseded dialog literal entries from the exact localization baseline.

## Outcome

The shortcut dialog now supports localized keybinding presentations without caching translated strings or using visible copy as identity. Locale changes update the title, description, group headings, and shortcut rows while preserving the existing DOM nodes and keybinding behavior.

Independent verification passed 34 focused tests across five files, TypeScript, the localization scanner, and diff checks. The complete frontend lint recipe also passed. The scanner baseline decreased from 1,499 to 1,497 exact findings, with no new findings and 50 keybinding compatibility entries remaining.

## Notes

Sol required the planned store and dialog steps to merge atomically so the codebase would not gain a temporary second presentation contract. Terra implemented the merged step, and Sol independently approved it with no findings.

### Bridge closure addendum

The global shortcut toggle now shares one typed descriptor between its keybinding and live
action. Shortcut and settings consumers are descriptor-only, omit malformed definitions,
and preserve stable action and group identity across English, French, and Arabic updates.
This residual producer work completed atomically with S250. Sol approved the closure with
no findings, 128 root-focused tests passed, and the complete frontend gate passed.
