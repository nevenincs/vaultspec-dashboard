---
tags:
  - '#audit'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-feature-group-authoring-adr]]"
  - "[[2026-07-14-feature-group-authoring-audit]]"
---

# `create-panel-hardening` audit: `mobile rendering, keyboard hardening, accessibility review`

## Scope

Hardening audit of the shipped feature-group create panel
(`CreateDocDialog`, delivered by the feature-group-authoring epic, all five
phases reviewed and merged) across three lenses: mobile/compact rendering,
keyboard-navigation hardening, and accessibility. Two independent read-only
auditors combed the panel, its Dialog/combobox primitives, the focus/keymap
seams, and the compact-shell conventions; findings below ground the
follow-on fix plan. Design ruling recorded here: the user-approved
`CreateDocDialog.compact` Figma frame is a 320-wide NARROW CENTERED MODAL
(a width-constrained stage-2 variant), not a bottom sheet — the centered
Dialog convention stands; fixes land inside it.

## Findings

### compact-submit-behind-keyboard | high | the Create/Cancel footer scrolls with the body and hides behind the soft keyboard

The footer lives inside the Dialog's `overflow-y-auto` body
(`CreateDocDialog.tsx:342-363`, `Dialog.tsx:99`) under a centered
`max-h-[80vh]` panel; with the soft keyboard up (~50% viewport) the primary
Create action falls behind the keyboard and must be scrolled to while
typing. Remediate by pinning the footer as a non-scrolling region of the
panel (with safe-area inset), keeping the approved centered-modal shape.

### no-compact-rendering-path | high | the panel never consults the viewport class; compact presentation is unverified

Mounted in both shell branches (`AppShell.tsx:201,238`) yet renders one
identical centered Dialog; no `useViewportClass()` read anywhere in the
file. Ruling above settles the shape (narrow centered modal per the
approved compact frame), so the remediation is compact verification +
targeted compact behavior (footer pinning, dropdown containment, target
sizes) rather than a sheet fork — plus a compact render test locking the
presentation.

### combobox-dropdown-clipped | medium | the feature-suggestion listbox clips inside the Dialog scroll container on short viewports

`AutocompleteCombobox.tsx:191-197` renders an absolute `max-h-[16rem]`
listbox inside the Dialog body's scroll container under `overflow-hidden`;
a keyboard-up compact viewport (~200-280px body) cuts the list off with no
flip or portal. The combobox is app-shared (the editor consumes it too) —
fix once at the primitive (portal or space-aware max-height).

### touch-target-subminimum | medium | three compact-path controls fall below the 2.75rem touch floor

Chip remove x (`CreateDocDialog.tsx:626-632`, ~12px, no padding), the
stage-2 back affordance (`:534-542`, ~18px tall), and the shared combobox
options (`AutocompleteCombobox.tsx:209-222`, ~20px) all miss the >=44px
floor the codebase applies elsewhere (`WorkspaceSwitcherSheet.tsx:21`).
Doc-type radios already pass (~53px).

### no-scroll-into-view-on-focus | medium | focused fields can sit behind the soft keyboard

`Dialog.tsx:47-53` focuses on open but nothing scrolls the focused field
into view; the stage-2 Title lower in the body can land behind the
keyboard (recoverable but hostile). The one-shot combobox auto-focus
(`CreateDocDialog.tsx:148-154`) pops the keyboard immediately when opened
from the Features affordance — acceptable for that deliberately
field-scoped entry, but the generic open must not auto-raise the keyboard.

### data-not-select-text | low | coverage and chip stems are not long-press selectable

Coverage stems (`CreateDocDialog.tsx:485`) and chip stems (`:625`) are
corpus data without `select-text`, diverging from touch-selectability D2
and the sibling convention (`WorkspaceSwitcherSheet.tsx:57`).

### no-safe-area-inset | low | the Dialog primitive carries no env(safe-area-inset)

`BottomSheet.tsx:81` handles safe areas; `Dialog.tsx` does not. Low for a
centered 80vh modal, but required alongside the footer-pinning fix.

### focus-lost-on-stage-transition | high | Continue/Back change stage but focus drops to body

The activated element unmounts on a stage flip and the Dialog focuses
content only on open (`Dialog.tsx:47-55`), so focus falls to
`document.body`: the next Tab restarts at the header Close, a screen-reader
user is silently orphaned. Remediate with stage-keyed focus placement
(stage 2 -> selected radio or Back; stage 1 -> the feature combobox).

### disabled-type-reason-unreachable | high | ineligible types are unfocusable AND skipped, so their served reason is never announced

Hard `disabled` on the radios (`CreateDocDialog.tsx:572`) plus
eligible-only roving (`:265-278`) makes the ADR D3 pedagogy invisible to
keyboard/SR users — the reason text (`:590`) associates with nothing.
Remediate with `aria-disabled` (focusable, roving-included, no-op
activation) + `aria-describedby` to the reason; the D3 "one-click path to
the prerequisite" remains unimplemented and joins the follow-ons.

### stage-transition-not-announced | medium | step 1 to step 2 is silent to screen readers

The dialog's label text swaps in place, which does not re-announce; no
step indicator or live region (`Dialog.tsx:81-88`,
`CreateDocDialog.tsx:306-311`).

### escape-discards-draft-no-confirm | medium | every dismiss path wipes the whole draft

Escape/backdrop/Cancel all reset the chrome — feature, title, and edited
links are gone on an accidental Escape. Remediate by preserving the draft
across dismiss (reset only on successful create), the confirm-free option
consistent with a chrome-local draft.

### coverage-arrival-silent | medium | the coverage card swaps Checking-to-rows with no live region

Async coverage arrival (`CreateDocDialog.tsx:420-464`) is never announced;
`aria-live="polite"` on the card body.

### default-initial-focus-is-close-button | medium | non-Features-affordance opens focus the header Close X

Only the `focusFeature` path redirects focus; palette/keymap/menu opens
land on Close (`Dialog.tsx:47-55`). Default initial focus should be the
feature combobox for every entry.

### home-end-missing-in-radiogroup | medium | APG Home/End unhandled in the type radiogroup

`onRadiogroupKeyDown` covers only the four arrows
(`CreateDocDialog.tsx:280-294`); Home/End should go first/last with the
same stopPropagation.

### reconcile-moves-tabstop-not-focus | medium | async eligibility reconcile can strand DOM focus off the tab stop

The reconcile effect may change the selected type while a radio holds
focus, moving the roving tab stop without moving focus
(`CreateDocDialog.tsx:159-163`, `:573`); the next arrow leaps from the
wrong place. Follow focus when the group owns it.

### touch-target-subminimum-a11y | medium | chip-remove and back also fail WCAG 2.5.8 (24px)

The keyboard/a11y lens independently confirms the mobile finding: the
chip x (~12px) and back caret miss even the 24px WCAG floor, not just the
project's 2.75rem touch floor. One remediation serves both.

### ink-faint-small-text-contrast | low | small ink-faint captions sit below AA 4.5:1 (needs a design-system ruling)

The token ledger clears ink-faint only for large text (4.13:1 light per
`styles.css:973-994`); the panel uses it for small captions (stems, "Not
yet", eyebrow, state lines). All are supplementary/duplicated signals.
Panel-local remediation: move information-bearing small captions to a
passing token; the systemic ink-faint usage question goes to the design
system, not this plan.

### removed-link-no-keyboard-readd | low | chip removal is one-way with only an undiscoverable recovery

Re-seeding requires toggling the doc type; no re-add affordance. Recorded;
a full link-picker is out of hardening scope.

### combobox-aria-controls-dangling | low | aria-controls names a listbox that is not always rendered

Inherited shared-combobox nit (`AutocompleteCombobox.tsx:187`); fix at
the primitive alongside the containment work.

### reduced-motion-unguarded | low | Dialog open animations ignore prefers-reduced-motion

`animate-fade-in`/`animate-slide-in-down` (`Dialog.tsx:61,75`) need the
reduced-motion gate at the primitive.

## Already solid (both auditors; do not churn)

Arrow roving with dispatcher shielding (window-spy locked), roving
tabindex discipline, chip-removal semantics (real named buttons), Dialog
trap/restore, combobox ARIA pattern, text-redundant states (no color-only
signal; accent pills 8.28:1), role=alert errors, eligibility-gated submit
on every path; horizontal-overflow-proof Dialog clamp, thorough
truncation, wrapping hints, scrolling body, no hover-gated actions,
compliant doc-type radios (~53px).

## Recommendations

- Fix the two primitives once, shared: Dialog grows a pinned
  (non-scrolling) footer slot + safe-area inset + reduced-motion gate +
  focused-field scroll-into-view; AutocompleteCombobox gets short-viewport
  listbox containment, the option touch floor, and the aria-controls nit.
- Panel behavior pass: stage-keyed focus management, default initial
  focus, aria-disabled reasons on ineligible types (+ Home/End, reconcile
  follows focus), stage/coverage live announcements, draft preservation
  across dismiss, chip/back target sizes, select-text stems, caption token
  pass.
- Compact verification: a viewport-class compact render suite locking
  footer reachability, dropdown containment, and target sizes; keyboard/
  focus regression tests for every HIGH/MEDIUM above.
- Defer as named follow-ons: the D3 one-click-prerequisite affordance, a
  keyboard re-add affordance for removed links, and the systemic ink-faint
  design-system ruling.

## Post-closeout handoff

- The ink-faint ruling (recorded in the token ledger) binds the concurrent
  rag-job-dashboard lane's new panels, which replaced the rag console mid-
  sweep and inherited its un-re-tokened information-bearing small text.
  That lane owns the re-token; the specifics live in the S13 step record.

## Resolution states (closeout, review-verified)

Every HIGH and MEDIUM finding above is CLOSED with a regression lock;
every LOW is CLOSED except the recorded judgments. Review of the full lane
(commits 94cd4d73c9, 8c8646e161, 91bf95d08f, bb8da4b60a): APPROVED, no
CRITICAL/HIGH. Fast-follows landed in-session: aria-owns across the
portaled listbox (the one review MEDIUM), Escape-consumption while the
suggestion list is open, and the two recorded judgments (stale-seed
preservation, compact keyboard-raise trade). The per-finding closure
evidence lives in the step records; the rag-lane ink-faint handoff above
remains with that lane.
