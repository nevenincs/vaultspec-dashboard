---
generated: true
tags:
  - '#index'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - '[[2026-07-12-authoring-surface-W01-P01-S01]]'
  - '[[2026-07-12-authoring-surface-W01-P01-S02]]'
  - '[[2026-07-12-authoring-surface-W01-P01-S03]]'
  - '[[2026-07-12-authoring-surface-W01-P01-S04]]'
  - '[[2026-07-12-authoring-surface-W01-P01-summary]]'
  - '[[2026-07-12-authoring-surface-W01-P02-S05]]'
  - '[[2026-07-12-authoring-surface-W01-P02-S06]]'
  - '[[2026-07-12-authoring-surface-W01-P02-S07]]'
  - '[[2026-07-12-authoring-surface-W01-P02-S08]]'
  - '[[2026-07-12-authoring-surface-W01-P02-summary]]'
  - '[[2026-07-12-authoring-surface-W02-P03-S09]]'
  - '[[2026-07-12-authoring-surface-W02-P03-S10]]'
  - '[[2026-07-12-authoring-surface-W02-P03-S11]]'
  - '[[2026-07-12-authoring-surface-W02-P03-summary]]'
  - '[[2026-07-12-authoring-surface-W02-P04-S12]]'
  - '[[2026-07-12-authoring-surface-W02-P04-S13]]'
  - '[[2026-07-12-authoring-surface-W02-P04-summary]]'
  - '[[2026-07-12-authoring-surface-W02-P05-S14]]'
  - '[[2026-07-12-authoring-surface-W02-P05-S15]]'
  - '[[2026-07-12-authoring-surface-W02-P05-S16]]'
  - '[[2026-07-12-authoring-surface-W02-P05-S17]]'
  - '[[2026-07-12-authoring-surface-W02-P05-summary]]'
  - '[[2026-07-12-authoring-surface-W03-P06-S18]]'
  - '[[2026-07-12-authoring-surface-W03-P06-S19]]'
  - '[[2026-07-12-authoring-surface-W03-P06-S20]]'
  - '[[2026-07-12-authoring-surface-W03-P06-summary]]'
  - '[[2026-07-12-authoring-surface-W03-P07-S21]]'
  - '[[2026-07-12-authoring-surface-W03-P07-S22]]'
  - '[[2026-07-12-authoring-surface-W03-P07-S23]]'
  - '[[2026-07-12-authoring-surface-W03-P07-S24]]'
  - '[[2026-07-12-authoring-surface-W03-P07-S25]]'
  - '[[2026-07-12-authoring-surface-W03-P07-S26]]'
  - '[[2026-07-12-authoring-surface-W03-P07-S27]]'
  - '[[2026-07-12-authoring-surface-W03-P07-summary]]'
  - '[[2026-07-12-authoring-surface-W03-P08-S28]]'
  - '[[2026-07-12-authoring-surface-W03-P08-S29]]'
  - '[[2026-07-12-authoring-surface-W03-P08-S30]]'
  - '[[2026-07-12-authoring-surface-W03-P08-summary]]'
  - '[[2026-07-12-authoring-surface-adr]]'
  - '[[2026-07-12-authoring-surface-plan]]'
  - '[[2026-07-12-authoring-surface-research]]'
---

# `authoring-surface` feature index

Auto-generated index of all documents tagged with `#authoring-surface`.

## Documents

### adr

- `2026-07-12-authoring-surface-adr` - `authoring-surface` adr: `surface every authoring capability: plan ticks, document comments, in-editor diff, visible create actions` | (**status:** `accepted`)

### exec

- `2026-07-12-authoring-surface-W01-P01-S01` - Add the plan-step set-state core capability invoking vault plan step check/uncheck with JSON output, an output cap and wall-clock timeout, confirming or widening the status vocabulary against the adapter success set
- `2026-07-12-authoring-surface-W01-P01-S02` - Enroll the set-plan-step-state changeset operation kind and materializer with the engine-side stale-base concurrency fence and a core-authoritative post-verify that re-reads the resulting step state
- `2026-07-12-authoring-surface-W01-P01-S03` - Accept the plan-step operation on the direct-writes route as a direct-only self-approved changeset with provenance, keyed on plan node id plus canonical step id
- `2026-07-12-authoring-surface-W01-P01-S04` - Integration tests: tick round-trip over a fixture plan, stale-base conflict refusal, and indeterminate-outcome resolution through the post-verify
- `2026-07-12-authoring-surface-W01-P01-summary` - `authoring-surface` `W01.P01` summary
- `2026-07-12-authoring-surface-W01-P02-S05` - Add the comments table migration with bounded per-document and per-store caps plus retention, and the typed repository over the authoring store
- `2026-07-12-authoring-surface-W01-P02-S06` - Model the comment entity anchored by the section selector, resolved exact-or-conflict on read into an honest orphaned flag, never a silent re-anchor
- `2026-07-12-authoring-surface-W01-P02-S07` - Serve bounded list, create, edit, resolve, and delete comment routes with actor-ref attribution and comment events on the authoring SSE channel
- `2026-07-12-authoring-surface-W01-P02-S08` - Engine tests: comment CRUD, anchor orphaning when the commented section is edited, and cap plus retention enforcement
- `2026-07-12-authoring-surface-W01-P02-summary` - `authoring-surface` `W01.P02` summary
- `2026-07-12-authoring-surface-W02-P03-S09` - Extend the authoring wire client with comment reads and mutations plus the plan-step set-state mutation, invalidating the plan-interior and comment queries on settle
- `2026-07-12-authoring-surface-W02-P03-S10` - Expose the comments view and mutation hooks and the plan-step tick hook with bounded caches and tolerant adapters
- `2026-07-12-authoring-surface-W02-P03-S11` - Live-wire tests for the new hooks over the fixture vault, including the comment SSE delta path
- `2026-07-12-authoring-surface-W02-P03-summary` - `authoring-surface` `W02.P03` summary
- `2026-07-12-authoring-surface-W02-P04-S12` - Give plan step rows a keyboard-operable checkbox inside the row focus zone, disabled off the present view, riding the tick mutation with visible in-flight state
- `2026-07-12-authoring-surface-W02-P04-S13` - Render test: tick a fixture step, assert served done-state reconciliation and the time-travel disable
- `2026-07-12-authoring-surface-W02-P04-summary` - `authoring-surface` `W02.P04` summary
- `2026-07-12-authoring-surface-W02-P05-S14` - Author the heading-path block-identity remark plugin producing stable slug ids with bounded per-block work
- `2026-07-12-authoring-surface-W02-P05-S15` - Wrap rendered headings with the right-side comment affordance and count chip, hover-revealed on pointer and always visible on compact, dispatching one new comment action descriptor
- `2026-07-12-authoring-surface-W02-P05-S16` - Build the section comment thread panel with list, compose, resolve, and orphaned-anchor handling composed from kit atoms
- `2026-07-12-authoring-surface-W02-P05-S17` - Render and guard tests: affordance visibility per viewport class, action-plane enrollment, and orphaned-comment rendering
- `2026-07-12-authoring-surface-W02-P05-summary` - `authoring-surface` `W02.P05` summary
- `2026-07-12-authoring-surface-W03-P06-S18` - Retain the opening text as baseText in the editor slice at open, cleared on close
- `2026-07-12-authoring-surface-W03-P06-S19` - Add the editor toggle-diff action and toolbar button mounting the pure diff-lines view as a collapsible draft-vs-saved section above the textarea
- `2026-07-12-authoring-surface-W03-P06-S20` - Tests: the diff toggle renders draft-vs-saved hunks and enrolls in keymap and palette under one id
- `2026-07-12-authoring-surface-W03-P06-summary` - `authoring-surface` `W03.P06` summary
- `2026-07-12-authoring-surface-W03-P07-S21` - Surface the view-edit toggle and close-editor accelerator hints on the segmented control
- `2026-07-12-authoring-surface-W03-P07-S22` - Author the vault-doc copy-link action descriptor producing a deep link with heading anchor when block-invoked, enrolled across menus and palette
- `2026-07-12-authoring-surface-W03-P07-S23` - Add the New-document secondary button to the workspace empty state through the shared new-document action
- `2026-07-12-authoring-surface-W03-P07-S24` - Add the vault-mode Plus create button to the browser-region header via the shared new-document action
- `2026-07-12-authoring-surface-W03-P07-S25` - Add the Features-section scoped Plus that opens the create dialog focused on the feature field
- `2026-07-12-authoring-surface-W03-P07-S26` - Swap the create-dialog feature input to the corpus-fed autocomplete combobox preserving free text for new tags
- `2026-07-12-authoring-surface-W03-P07-S27` - Render and guard tests for every new affordance: single-descriptor law, coverage guards, compact variants
- `2026-07-12-authoring-surface-W03-P07-summary` - `authoring-surface` `W03.P07` summary
- `2026-07-12-authoring-surface-W03-P08-S28` - Delete the unmounted Inspector, NowStrip, and DocHeader components together with their render tests
- `2026-07-12-authoring-surface-W03-P08-S29` - Mirror the new affordances into the binding design file or record the deliberate divergence
- `2026-07-12-authoring-surface-W03-P08-S30` - Run the full epic gate for both languages and persist the closeout summary
- `2026-07-12-authoring-surface-W03-P08-summary` - `authoring-surface` `W03.P08` summary

### plan

- `2026-07-12-authoring-surface-plan` - `authoring-surface` plan

### research

- `2026-07-12-authoring-surface-research` - `authoring-surface` research: `complete document authoring, creation, and review UX`
