---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S249'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate keyboard navigation, project, and working-set bindings and orphaned presentation copy

## Scope

- Keyboard-navigation, project, and working-set producers and tests.
- Keyboard announcement and working-set render boundaries.
- Graph, feature, and project catalogs, policy, test resources, and scanner baseline.

## Description

- Replace action and keybinding bridge strings with shared typed descriptors.
- Move keyboard announcements and working-set copy to render-time localization.
- Format working-set counts for the active locale and replace fragment concatenation with complete messages.
- Suppress unsupported stable identifiers with localized generic item presentation.
- Preserve IDs, chords, contexts, eligibility, state behavior, ordering, and callback targets.

## Outcome

Navigation, project, and working-set commands now use one localized action vocabulary. The working-set surface contains no hot-typed presentation strings, prohibited em dash, or raw unsupported identifier fallback.

## Notes

Terra implemented the step. Sol found and verified fixes for the keybinding group type and unsupported working-set identifiers, then approved the final diff with no findings. Fifty-six focused tests and the full frontend lint recipe passed. The scanner is clean at 1,102 findings after removing sixteen exact exemptions.
