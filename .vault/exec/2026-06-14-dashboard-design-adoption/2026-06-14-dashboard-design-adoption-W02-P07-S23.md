---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S23'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




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
palette suite is 23 tests green (15 interactive + 8 unit) after the review revision; the
full frontend suite is 576 passed, 9 pre-existing skips, 0 failures. The palette now reads
as a native member of the agentic-desktop cohort, shares the token / motion / icon layers,
and carries the complete keyboard-first accessibility contract the ADR pins.

## Review revision (PASS-WITH-REVISIONS)

The independent design review of the first commit returned PASS-WITH-REVISIONS (no
CRITICAL/HIGH). Two MEDIUM disarm-hygiene gaps and one near-tautological trap test were
fixed in this revision:

- M1 (disarm hygiene): two exit paths skipped disarm and leaked the armed state into the
  process-wide confirm guard — the backdrop dismiss (only hid the palette) and activating
  a non-confirm row while an ops verb was armed. Introduced a single `close()` helper
  (disarm then hide) and a shared `disarm()` primitive; every exit path (Escape, the
  Ctrl/Cmd-K toggle, backdrop dismiss, activating a non-confirm row, and editing the
  query) now routes through it, and the non-confirm activation disarms before running.
- M2 (pointer/keyboard parity): `onMouseEnter` moved the cursor without the disarm the
  keyboard cursor performs, desyncing the armed row from the visually-selected row for
  pointer users. Both paths now call one `setCursorTo` cursor-setter that disarms.
- M3 (test honesty): the focus-trap test was near-tautological because the input was the
  only tab stop. Strengthened it to inject a second real tab stop into the panel and
  assert the wrap-around actually cycles (last to first, first to last) and that the
  handler calls `preventDefault`. This exposed and fixed a real trap defect: `focusablesOf`
  selected `tabindex="-1"` buttons (the result rows), so the input was not the true first
  stop; the selector now excludes any `tabindex="-1"` element.
- L1 (a11y honesty): when no search result matches but the contextual save-lens row is the
  sole survivor, the live region now announces `no matches — save current filters as lens
  "..."` instead of a bare "nothing matches" while a row is selected.

L2 (ops request-ordering token) was assessed and deferred as optional: the ops verbs are
single-slotted behind the arm-to-confirm guard and run one at a time from the palette, so
out-of-order resolution is not reachable through this surface; a token guard would be
dead code here. Four disarm-hygiene tests were added covering all M1/M2 exit paths.

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
