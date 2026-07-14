---
generated: true
tags:
  - '#index'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-create-panel-hardening-P01-S01]]'
  - '[[2026-07-14-create-panel-hardening-P01-S02]]'
  - '[[2026-07-14-create-panel-hardening-P01-S03]]'
  - '[[2026-07-14-create-panel-hardening-P01-summary]]'
  - '[[2026-07-14-create-panel-hardening-P02-S04]]'
  - '[[2026-07-14-create-panel-hardening-P02-S05]]'
  - '[[2026-07-14-create-panel-hardening-P02-S06]]'
  - '[[2026-07-14-create-panel-hardening-P02-S07]]'
  - '[[2026-07-14-create-panel-hardening-P02-summary]]'
  - '[[2026-07-14-create-panel-hardening-P03-S08]]'
  - '[[2026-07-14-create-panel-hardening-P03-S09]]'
  - '[[2026-07-14-create-panel-hardening-P03-S10]]'
  - '[[2026-07-14-create-panel-hardening-P03-summary]]'
  - '[[2026-07-14-create-panel-hardening-P04-S11]]'
  - '[[2026-07-14-create-panel-hardening-P04-S12]]'
  - '[[2026-07-14-create-panel-hardening-P04-S13]]'
  - '[[2026-07-14-create-panel-hardening-P04-S14]]'
  - '[[2026-07-14-create-panel-hardening-P04-summary]]'
  - '[[2026-07-14-create-panel-hardening-adr]]'
  - '[[2026-07-14-create-panel-hardening-audit]]'
  - '[[2026-07-14-create-panel-hardening-plan]]'
---

# `create-panel-hardening` feature index

Auto-generated index of all documents tagged with `#create-panel-hardening`.

## Documents

### adr

- `2026-07-14-create-panel-hardening-adr` - `create-panel-hardening` adr: `panel hardening decisions` | (**status:** `accepted`)

### audit

- `2026-07-14-create-panel-hardening-audit` - `create-panel-hardening` audit: `mobile rendering, keyboard hardening, accessibility review`

### exec

- `2026-07-14-create-panel-hardening-P01-S01` - Grow the Dialog a pinned non-scrolling footer slot (safe-area inset), gate its open animations on prefers-reduced-motion, and scroll the focused field into view within the body
- `2026-07-14-create-panel-hardening-P01-S02` - Contain the combobox listbox on short viewports (portal or space-aware max-height), raise option rows to the touch floor, and render aria-controls only when the listbox exists
- `2026-07-14-create-panel-hardening-P01-S03` - Update or add primitive render tests for the footer slot, reduced-motion gate, and listbox containment, and re-run every existing Dialog and combobox consumer suite green
- `2026-07-14-create-panel-hardening-P01-summary` - `create-panel-hardening` `P01` summary
- `2026-07-14-create-panel-hardening-P02-S04` - Move focus deterministically on stage transitions, default initial focus to the feature combobox for every entry point, and announce the stage change
- `2026-07-14-create-panel-hardening-P02-S05` - Make ineligible type rows aria-disabled and roving-included with their served reason associated via aria-describedby, add Home and End, and follow focus when reconcile moves the selection
- `2026-07-14-create-panel-hardening-P02-S06` - Preserve the create draft across dismiss and reset it only on successful create, with store unit tests
- `2026-07-14-create-panel-hardening-P02-S07` - Raise the chip-remove and back affordances to the touch floor, mark stems select-text, put a polite live region on the coverage card, and move information-bearing small captions off ink-faint
- `2026-07-14-create-panel-hardening-P02-summary` - `create-panel-hardening` `P02` summary
- `2026-07-14-create-panel-hardening-P03-S08` - Author the compact render suite (viewport-class driven): footer reachability with constrained height, listbox containment, touch-target floors, and the 320-width presentation
- `2026-07-14-create-panel-hardening-P03-S09` - Add keyboard and announcement regression tests: stage-transition focus, default initial focus, aria-disabled reason reachability, Home and End, draft preservation on Escape
- `2026-07-14-create-panel-hardening-P03-S10` - Run the full lint gate for the frontend and vault check all, confirm exit 0 for our lane, and route the phase set to code review
- `2026-07-14-create-panel-hardening-P03-summary` - `create-panel-hardening` `P03` summary
- `2026-07-14-create-panel-hardening-P04-S11` - Add the one-click prerequisite affordance on ineligible type rows: activating the reason selects and focuses the missing upstream type (ADR D3's promised path)
- `2026-07-14-create-panel-hardening-P04-S12` - Add a corpus-fed add-link affordance to the Linked documents row so removed links are keyboard-recoverable, reusing the shared combobox over the linking corpus
- `2026-07-14-create-panel-hardening-P04-S13` - Record the ink-faint ruling in the token ledger (large-text and decorative only) and re-token every information-bearing small-text ink-faint usage app-wide to a passing ink
- `2026-07-14-create-panel-hardening-P04-S14` - Extend the render and store tests for the prerequisite affordance and link re-add, and re-run the full frontend gate and vault check green
- `2026-07-14-create-panel-hardening-P04-summary` - `create-panel-hardening` `P04` summary

### plan

- `2026-07-14-create-panel-hardening-plan` - `create-panel-hardening` plan
