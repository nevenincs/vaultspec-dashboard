---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S23'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-design-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S23 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Rebuild the Cmd/Ctrl+K command palette as a lifted surface on the new tokens per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green and ## Scope

- `frontend/src/app` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the Cmd/Ctrl+K command palette as a lifted surface on the new tokens per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app`

## Description

Brought the existing Cmd/Ctrl+K command palette in `CommandPalette.tsx` fully onto the
new OKLCH token foundation and completed its accessibility contract per the
command-palette ADR. This is a re-skin and gap-fill of the existing component, not a
rebuild: the pure command-assembly core and the seam routing were preserved.

Per-ADR React element inventory (every element the ADR specifies, mapped to existing or
new JSX):

- Overlay / scrim: existing backdrop `div`, re-skinned to the dimmed scrim treatment;
  backdrop dismiss restricted to clicks on the scrim itself.
- Lifted panel: existing panel `div`, re-grounded onto the modal elevation step
  (`shadow-deep`) and modal radius (`rounded-vs-xl`); promoted to a true
  `role="dialog"` with `aria-modal` and a real focus trap.
- Search affordance: NEW Lucide `Search` chrome mark on the leading edge of the input.
- Query input: existing `input`, wired as `role="combobox"` with `aria-expanded`,
  `aria-controls`, `aria-autocomplete`, and `aria-activedescendant` naming the cursor
  row.
- Result groups: NEW per-family group headings (navigate / filters / core ops / rag
  ops) via `groupByFamily`, the object-then-action taxonomy the ADR mandates.
- Result rows: existing row buttons, promoted to `role="option"` with `aria-selected`,
  stable per-row ids for active-descendant, and the cursor walking DISPLAY order.
- Inline shortcut hints: NEW trailing inline-shortcut treatment - a monospace
  double-Enter chip on destructive ops, a Lucide `CornerDownLeft` glyph on the selected
  non-destructive row.
- Selected-row highlight: existing tint plus a NEW non-color-only structural cue (a 2px
  accent left border on the selected row; transparent otherwise).
- Empty / no-match state: existing quiet "nothing matches" row, now shown whenever no
  SEARCH result matched (the contextual save-lens action no longer masks it).
- Loading state: NEW subtle liveness cue for the navigate family while the filters
  vocabulary resolves, tied to real `isPending` state.
- Degraded / ops-result state: NEW inline `role="status"` line surfacing the ops
  dispatch result (running / ok / unavailable / error message) without closing the
  palette.
- Live region: NEW polite `sr-only` region announcing result count, selection, and the
  arm-to-confirm prompt, de-duplicated against fast typing.

Implementation notes:

- Consumed only the semantic token layer (elevation, focus/accent, motion, density,
  radius tokens); no hardcoded hex or px. Lucide-only chrome icons. Reduced-motion is
  honoured app-wide by the token floor; keyboard activations are instant.
- Full keyboard + a11y contract: focus capture-and-restore across the open/close
  lifecycle, a real Tab/Shift+Tab focus trap that cannot escape the dialog, ArrowUp/Down
  result navigation, Enter activate (arm-then-confirm for destructive ops), Escape close
  with disarm, visible focus, and the non-color-only selected cue.
- Layer ownership preserved: the palette reads store state through stores hooks only,
  never fetches the engine, never reads the raw `tiers` block, and every ops verb
  dispatches through the `appDispatcher` seam via `dispatchOps`.

Tests extended in `CommandPalette.interactive.test.tsx` (keyboard nav, focus
capture/restore, ARIA wiring, the honest no-match / inline-ops states, focus trap, the
toggle/Escape lifecycle, family grouping) and `CommandPalette.test.ts` (the new `family`
field, forgiving multi-token fuzzy match, and `groupByFamily` ordering). The pre-existing
safety-semantics tests were retained and updated for the new confirm-prompt copy.

## Outcome

Full lint gate `just dev lint frontend` exits 0 (eslint + prettier + tsc all clean). The
palette suite is 19 tests green (11 interactive + 8 unit); the full frontend suite is 566
passed, 9 pre-existing skips, 0 failures. The palette now reads as a native member of the
agentic-desktop cohort, shares the token / motion / icon layers, and carries the complete
keyboard-first accessibility contract the ADR pins.

## Notes

A real correctness defect surfaced while adding family grouping: the keyboard cursor
indexed the raw build-order command array, but grouping re-orders the rows for display
(filters before ops, the contextual save-lens folded into filters). The cursor and the
visually-highlighted row could desync. Fixed by walking a flattened DISPLAY-order list
(`ordered`) for the cursor, active-descendant, and activation, so the highlighted row and
the keyboard cursor always agree.

One ADR-vs-implementation tension noted: the contextual "save current filters as lens"
command embeds the typed query in its own label, so it always matches its own query - it
could mask the ADR's no-results state entirely. Resolved by computing the no-match state
from SEARCH results only (excluding the save-lens action), so the quiet "nothing matches"
row appears alongside the still-available save action rather than being suppressed by it.
This is a behaviour the command-palette ADR does not address explicitly; flagged for the
design review.
