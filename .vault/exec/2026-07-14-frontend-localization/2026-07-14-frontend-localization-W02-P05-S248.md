---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S248'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize keyboard shortcut settings

## Scope

- The settings keybinding view projection and conflict contract
- The keybinding recorder component and real-behavior tests
- Common English catalog, message policy, and alternate-locale resources
- The exact localization scanner baseline

## Description

- Carry normalized label and group presentations through settings view models with stable action and semantic group IDs.
- Return conflict presentations with stable IDs and remove the raw action-ID display fallback.
- Fail closed on malformed labels, groups, and conflict presentations.
- Resolve all settings labels, groups, conflict guidance, recorder text, actions, and accessibility names during React render.
- Preserve recorder state, DOM identity, chord capture, override serialization, reset behavior, and first-seen ordering across locale changes.
- Replace English concatenation with complete catalog messages and actionable conflict guidance.
- Replace development-state empty copy with a compact user-facing status.
- Remove the 13 superseded component literal entries from the exact localization baseline.

## Outcome

Keyboard shortcut settings now update reactively with the active locale without caching translated strings or using visible text as identity. Conflict guidance names the conflicting action and tells the user to choose another shortcut, while malformed or missing presentations can no longer expose action IDs.

Independent verification passed 42 focused tests across six files, TypeScript, ESLint, the localization scanner, and diff checks. The complete frontend lint recipe also passed. The scanner baseline decreased from 1,497 to 1,484 exact findings with no additions, while 50 keybinding producer bridge entries remain.

## Notes

Terra implemented the bounded settings migration from a read-only rollout map. Sol approved the architecture before implementation and independently accepted the final patch with no findings.
