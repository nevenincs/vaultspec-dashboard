---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Enroll the filter facet list (KIND/doc-type/feature/STATUS/HEALTH) onto FocusZone as one contained zone

## Scope

- `live-verify it is no longer an inline trap`
- `frontend/src/app/stage/FilterSidebar.tsx`

## Description

- Verified the filter facet list is keyboard-accessible WITHOUT a FocusZone enrollment — and deliberately did NOT add one. The facet rows are native `<input type="checkbox">` / `<input type="radio">` (the kit `FacetRow` wraps a real input in a `<label>`), so per WAI-ARIA APG each checkbox is its own tab stop and radios form a native radiogroup. Forcing FocusZone roving over a checkbox group would VIOLATE the checkbox pattern (users expect Tab between independent checkboxes), so the correct action is to leave the native semantics intact.
- The flyout's "no inline trap" requirement is met by the kit `Popover` (`role="dialog"`, light-dismiss + the S09 `useFocusRestore`): it opens on demand from the rail Filters button (not the old auto-open trap), Escape dismisses, and focus returns to the trigger.
- Made NO edit to `FilterSidebar.tsx` (a concurrent campaign has it uncommitted) — verification only, so no collision.

## Outcome

- Live-verified via the own-Chromium harness (real keyboard flow): focus the rail Filters trigger → Enter opens the flyout (`role="dialog"`, 7 native checkbox facets, first checkbox focusable) → Space toggles a facet (checked true→false through the store round-trip) → Escape closes the flyout and RESTORES focus to the exact trigger (`onTrigger: true`, region left-rail, not body). No trap, no body-drop, facets keyboard-operable.

## Notes

- An earlier harness reading showed a body-drop on Escape; that was an artifact of a programmatic `.click()` (which does not move focus, so the Popover captured the wrong restore target). The accurate keyboard flow (focus → Enter → Escape) restores to the trigger correctly.
- This closes the step by satisfying its INTENT (contained, no trap, keyboard-accessible) the APG-correct way; the literal "enroll onto FocusZone" is intentionally not applied because native checkboxes must each stay a tab stop. Sibling to the S26/S27/S20/S17 verify-only closures.
