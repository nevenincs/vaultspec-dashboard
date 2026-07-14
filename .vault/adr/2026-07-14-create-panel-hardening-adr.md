---
tags:
  - '#adr'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-create-panel-hardening-audit]]"
  - "[[2026-07-14-feature-group-authoring-research]]"
---

# `create-panel-hardening` adr: `panel hardening decisions` | (**status:** `accepted`)

## Problem Statement

The hardening audit of the shipped feature-group create panel found four
HIGH defects across mobile rendering, keyboard navigation, and
accessibility, plus MEDIUM/LOW findings. The remediation carries a handful
of decisions worth recording: where the fixes live (primitive vs panel),
the floating-listbox strategy, the disabled-row accessibility policy, and
the draft-loss policy. The user approved the remediation plan and directed
that the audit's deferred follow-ons be delivered too; this ADR records the
decisions that plan executes. Status is accepted at authoring: the
decisions were approved with the plan.

## Considerations

- The approved compact Figma frame is a narrow centered modal, so compact
  behavior must land inside the Dialog primitive, not as a sheet fork.
- The Dialog and AutocompleteCombobox are shared primitives: fixing them
  once serves every consumer, but every consumer must be re-verified.
- The codebase's floating-surface idiom is portal + fixed positioning
  (the context-menu host); its reduced-motion idiom is motion-reduce
  utility variants; its coarse-pointer seam is the shared pointer-coarse
  hook.
- ARIA guidance for disabled options: focusable-but-inert (aria-disabled)
  keeps state and reason perceivable where hard `disabled` hides them.
- The chrome store's draft is client-local; the framework holds no
  provisional feature state (carried from the feature-group ADR).

## Considered options

- **Bottom-sheet fork on compact** - rejected: contradicts the approved
  compact frame and the codebase convention that genuinely-modal dialogs
  stay centered; sheets are for rail/flyout surfaces.
- **In-place absolute listbox with height capping only** - rejected: the
  dialog body's scroll container still clips or awkwardly scrolls the
  list; containment is only correct with viewport-anchored positioning.
- **Portal + fixed, space-aware listbox (chosen)** - the context-menu
  idiom; flips above when below-space is tight.
- **Hard-disabled ineligible type rows (status quo)** - rejected by the
  audit: unfocusable rows make the pipeline pedagogy invisible to
  keyboard/screen-reader users.
- **aria-disabled, roving-included rows with described reasons (chosen).**
- **Confirm-on-dirty dismiss** - rejected: a confirmation dialog on Escape
  is hostile; preserving the draft across dismiss (reset only on
  successful create) loses nothing and needs no ceremony.
- **Darken the ink-faint token globally** - rejected: retunes every
  surface for a usage-level problem; the ruling instead scopes ink-faint
  to large/decorative text and re-tokens information-bearing small text.

## Constraints

- Primitive changes are additive (an optional footer slot), never a
  bespoke per-dialog fork; consumers migrate their action rows into the
  slot so the pinned behavior is uniform.
- The portaled listbox must keep the existing combobox ARIA contract and
  the blur/commit semantics (mousedown swallowing) intact.
- The draft-preservation change must not survive a successful create
  (stale prefill would misattribute the next document).
- All fixes stay inside the frontend; no wire or engine change.

## Implementation

Dialog: an optional pinned footer slot below the one scrolling body
(safe-area inset), motion-reduce gating on the open animations, and
focused-field scroll-into-view. AutocompleteCombobox: the listbox portals
to the body with fixed, space-aware placement and flips above on tight
viewports; option rows grow to the touch floor on coarse pointers;
aria-controls only names a rendered listbox. Panel: stage-keyed focus
management with a default initial focus on the feature field, aria-disabled
ineligible rows with described reasons and full roving (Home/End,
reconcile-follows-focus), live announcements for stage and coverage
arrival, draft preservation across dismiss, touch-floor chip/back
affordances, select-text stems, and information-bearing captions moved off
ink-faint. Follow-ons delivered in the same plan: the one-click
prerequisite affordance on ineligible rows, a corpus-fed add-link
affordance for the related chips, and the app-wide ink-faint usage
remediation under the recorded ruling.

## Rationale

Every decision follows an existing convention rather than inventing one:
the pinned footer generalizes the sheet's safe-area behavior into the
modal primitive; the portal idiom is the context-menu host's; aria-disabled
over disabled is the accessibility-correct reading of the panel's own
design goal (the pipeline stays visible); draft preservation is the
cheapest honest fix for data loss. Fixing primitives once, then verifying
every consumer, beats panel-local workarounds that would fork behavior.

## Consequences

- Every dialog in the app gains the pinned footer, reduced-motion, and
  scroll-into-view behavior for free; every combobox consumer gains
  containment. Consumer suites are the regression net.
- The portaled listbox adds scroll/resize listeners while open - bounded,
  removed on close.
- aria-disabled rows are focusable: keyboard users gain reachability at
  the cost of one extra roving stop per ineligible type - the deliberate
  trade.
- Draft preservation changes dismiss semantics panel-wide; tests pin the
  reset-on-success boundary.
- The ink-faint ruling touches surfaces beyond the panel; the sweep is
  bounded to information-bearing small-text usages.
