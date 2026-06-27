---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S08'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Migrate the ~30 elevation usages from the six-level scale to the three Figma levels, smallest blast radius first

## Scope

- `frontend/src/`

## Description

- Adopted the binding Figma three-level elevation scale (raised, overlay, popover) as the canonical generated foundation, available as the shadow foundation tokens.
- Applied the alias-over-sweep strategy directed by the ADR: rather than sweep the elevation usages across files that the chrome and scene rewrites will replace, kept the legacy six-level shadow names as deprecated aliases onto the three Figma levels.
- Mapped the legacy levels onto the binding three: the flat level stays a literal none, card and panel map to raised, float maps to overlay, and dialog and deep map to popover; the per-theme dark and high-contrast shadow remaps stay hand-authored and continue to override.

## Outcome

The current app stays visually stable and the gate stays green with no mass elevation sweep, while the canonical foundation is the three Figma levels. The real usage cutover to the raised/overlay/popover tokens happens in the W02 chrome and W03 scene rewrites, where the files are rebuilt against the foundation; the deprecated aliases are removed in W04.

## Notes

Alias-vs-sweep decision (recorded per the phase refinement): the ADR rewrites all of the app and scene layers in W02 and W03, so sweeping elevation usages in files about to be discarded is wasted effort. The chosen approach adopts the Figma taxonomy as canonical and keeps the legacy names as deprecated aliases, which keeps the current app green with no behavioural change. The collapse from six levels to three is a deliberate, documented mapping (card/panel to raised; float to overlay; dialog/deep to popover); the slight loss of distinct mid-levels is acceptable because the rewrite re-picks the correct binding level per surface. The styles.css alias block is co-located in the single stylesheet file and shipped in the S05 commit; this record and the plan checkbox close the step.
