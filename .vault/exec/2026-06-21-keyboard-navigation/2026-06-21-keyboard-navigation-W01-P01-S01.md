---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-21'
step_id: 'S01'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Build the FocusZone primitive (roving + activedescendant modes, arrow/Home/End/typeahead, orientation, wrap, entry-memory, single tab stop) composing the existing roving-focus and focus-restore utilities

## Scope

- `frontend/src/app/chrome/useFocusZone.ts`

## Description

- Studied the two hardest existing roving consumers (the left-rail vault tree and the kit segmented toggle) to derive a primitive API that fits both before writing it.
- Authored `useFocusZone` plus two pure, exported helpers: `resolveFocusTarget` (ordered next/prev/first/last with wrap-or-clamp) and `resolveFocusKey` (event key to a primary move intent or a secondary cross-axis intent, by orientation).
- Implemented the render-time registration pattern (each visible item calls `rove(key)` in order) so the single-tab-stop fallback (first item carries `tabIndex 0` before any focus) is computed synchronously, matching the proven tree pattern.
- Wrote unit tests for both pure helpers (next/prev/first/last, wrap vs clamp, unknown origin, empty list, every orientation, unowned keys).

## Outcome

- `useFocusZone.ts` and `useFocusZone.test.ts` land in `app/chrome` beside the focus utilities they compose. Tests: 11/11 pass (vitest). Prettier, eslint, and tsc all clean on both files.
- The primitive contributes exactly one tab stop and exposes cross-axis hooks (`onCrossNext`/`onCrossPrev`) so tree consumers bind expand/collapse without the zone owning those semantics.

## Notes

- Scope corrected from the plan's tentative `platform/focus/FocusZone.tsx` to `app/chrome/useFocusZone.ts`: the primitive composes `moveRovingFocus`/`useFocusRestore`/`focusTrap`, which live in `app/chrome`, and the `platform` layer forbids upward imports. Step scope was updated via the plan CLI.
- The ADR's "activedescendant mode" is realized by NOT converting the comboboxes (palettes keep their existing `aria-activedescendant` model per the ADR); the primitive defaults to roving and the combobox surfaces are verified, not rewritten, in W06.
- Cross-zone entry memory (returning to a region's last-focused child) is layered at the region-registry level (W01.P02), not in the per-zone hook; within a zone, the active-key roving already restores the last position on re-render.
- Live-verify on a real mount is deferred to the first consumer adoption (W01.P02 region work / W02 tree), where the hook runs in situ; S02's pure-logic tests are green now.
