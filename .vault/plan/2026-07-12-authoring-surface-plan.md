---
tags:
  - '#plan'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
tier: L3
related:
  - '[[2026-07-12-authoring-surface-adr]]'
---

# `authoring-surface` plan

## Wave `W01` - Backend: ledgered plan ticks and the comments store

Land the two net-new backend seams the ADR decides: the plan-step set-state capability riding the ledgered direct-write path (D1), and the comments plane as authoring-state entities anchored to heading sections (D2). Everything here is engine-side and test-verified before any frontend consumes it.

### Phase `W01.P01` - Plan-step tick capability (D1)

One new core-adapter capability invoking the canonical plan CLI verbs, enrolled as a changeset operation with an engine-side concurrency fence and a core-authoritative post-verify, served on the direct-writes route as a direct-only self-approved changeset.

- [x] `W01.P01.S01` - Add the plan-step set-state core capability invoking vault plan step check/uncheck with JSON output, an output cap and wall-clock timeout, confirming or widening the status vocabulary against the adapter success set; `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`.
- [x] `W01.P01.S02` - Enroll the set-plan-step-state changeset operation kind and materializer with the engine-side stale-base concurrency fence and a core-authoritative post-verify that re-reads the resulting step state; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W01.P01.S03` - Accept the plan-step operation on the direct-writes route as a direct-only self-approved changeset with provenance, keyed on plan node id plus canonical step id; `engine/crates/vaultspec-api/src/authoring/http.rs`.
- [x] `W01.P01.S04` - Integration tests: tick round-trip over a fixture plan, stale-base conflict refusal, and indeterminate-outcome resolution through the post-verify; `engine/crates/vaultspec-api/tests`.

### Phase `W01.P02` - Comments plane backend (D2)

A bounded comments entity in the authoring store anchored by the section selector, resolved exact-or-conflict into an honest orphaned state, served over new authoring routes with actor-ref attribution and SSE events.

- [x] `W01.P02.S05` - Add the comments table migration with bounded per-document and per-store caps plus retention, and the typed repository over the authoring store; `engine/crates/vaultspec-api/src/authoring/store`.
- [x] `W01.P02.S06` - Model the comment entity anchored by the section selector, resolved exact-or-conflict on read into an honest orphaned flag, never a silent re-anchor; `engine/crates/vaultspec-api/src/authoring/comments.rs`.
- [x] `W01.P02.S07` - Serve bounded list, create, edit, resolve, and delete comment routes with actor-ref attribution and comment events on the authoring SSE channel; `engine/crates/vaultspec-api/src/authoring/http.rs`.
- [x] `W01.P02.S08` - Engine tests: comment CRUD, anchor orphaning when the commented section is edited, and cap plus retention enforcement; `engine/crates/vaultspec-api/tests`.

## Wave `W02` - Frontend: comment affordances and plan-tick UI

Consume the W01 seams: stores wiring (sole wire client) for comments and plan ticks, the keyboard-operable step checkbox in the status rail, and the reader-side heading comment affordances with the thread panel. Touch, click, and keyboard parity throughout.

### Phase `W02.P03` - Stores wiring for comments and plan ticks

The stores layer stays the sole wire client: comment reads/mutations and the plan-step tick mutation with bounded caches, tolerant adapters, and live-wire tests.

- [x] `W02.P03.S09` - Extend the authoring wire client with comment reads and mutations plus the plan-step set-state mutation, invalidating the plan-interior and comment queries on settle; `frontend/src/stores/server/authoring.ts`.
- [x] `W02.P03.S10` - Expose the comments view and mutation hooks and the plan-step tick hook with bounded caches and tolerant adapters; `frontend/src/stores/server/queries.ts`.
- [x] `W02.P03.S11` - Live-wire tests for the new hooks over the fixture vault, including the comment SSE delta path; `frontend/src/stores/server`.

### Phase `W02.P04` - Plan-step checkbox in the status rail (D1)

Step rows become actionable: a keyboard-operable checkbox inside the row focus zone, disabled off the present view, riding the tick mutation with visible in-flight state.

- [x] `W02.P04.S12` - Give plan step rows a keyboard-operable checkbox inside the row focus zone, disabled off the present view, riding the tick mutation with visible in-flight state; `frontend/src/app/right/PlanStepTree.tsx`.
- [x] `W02.P04.S13` - Render test: tick a fixture step, assert served done-state reconciliation and the time-travel disable; `frontend/src/app/right/PlanStepTree.render.test.tsx`.

### Phase `W02.P05` - Reader comment affordances and thread panel (D2)

Heading-path block identity in the reader, the right-side comment affordance (hover on pointer, always visible on compact) with a count chip, and the section thread panel composed from kit atoms - all verbs on the unified action plane.

- [x] `W02.P05.S14` - Author the heading-path block-identity remark plugin producing stable slug ids with bounded per-block work; `frontend/src/app/viewer/remarkBlockId.ts`.
- [x] `W02.P05.S15` - Wrap rendered headings with the right-side comment affordance and count chip, hover-revealed on pointer and always visible on compact, dispatching one new comment action descriptor; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [x] `W02.P05.S16` - Build the section comment thread panel with list, compose, resolve, and orphaned-anchor handling composed from kit atoms; `frontend/src/app/viewer/CommentThreadPanel.tsx`.
- [x] `W02.P05.S17` - Render and guard tests: affordance visibility per viewport class, action-plane enrollment, and orphaned-comment rendering; `frontend/src/app/viewer`.

## Wave `W03` - Polish and housekeeping: diff, create actions, cruft

Close the remaining ADR decisions: the in-editor draft-vs-saved diff (D4), reading-mode accelerator hints and the copy-link verb (D3), visible create affordances across empty state, rail header, and tree sections (D5), the corpus-fed feature combobox (D6), and deletion of the orphaned right-rail components (D7), ending with the full epic gate.

### Phase `W03.P06` - In-editor diff (D4)

The editor retains its opening text and gains a toggleable draft-vs-saved diff reusing the pure diff-lines view - zero new wire calls.

- [ ] `W03.P06.S18` - Retain the opening text as baseText in the editor slice at open, cleared on close; `frontend/src/stores/view/editor.ts`.
- [ ] `W03.P06.S19` - Add the editor toggle-diff action and toolbar button mounting the pure diff-lines view as a collapsible draft-vs-saved section above the textarea; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [ ] `W03.P06.S20` - Tests: the diff toggle renders draft-vs-saved hunks and enrolls in keymap and palette under one id; `frontend/src/app/viewer`.

### Phase `W03.P07` - Visible create actions and reading-mode polish (D3, D5, D6)

Accelerator hints, the copy-link verb, New-document buttons in the empty state and rail header, the scoped Features-section create, and the corpus-fed feature combobox in the create dialog - every affordance dispatching the one shared descriptor.

- [ ] `W03.P07.S21` - Surface the view-edit toggle and close-editor accelerator hints on the segmented control; `frontend/src/app/viewer/DocChrome.tsx`.
- [ ] `W03.P07.S22` - Author the vault-doc copy-link action descriptor producing a deep link with heading anchor when block-invoked, enrolled across menus and palette; `frontend/src/app/menus`.
- [ ] `W03.P07.S23` - Add the New-document secondary button to the workspace empty state through the shared new-document action; `frontend/src/app/stage/WorkspaceGhost.tsx`.
- [ ] `W03.P07.S24` - Add the vault-mode Plus create button to the browser-region header via the shared new-document action; `frontend/src/app/left/BrowserRegion.tsx`.
- [ ] `W03.P07.S25` - Add the Features-section scoped Plus that opens the create dialog focused on the feature field; `frontend/src/app/left/TreeBrowser.tsx`.
- [ ] `W03.P07.S26` - Swap the create-dialog feature input to the corpus-fed autocomplete combobox preserving free text for new tags; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `W03.P07.S27` - Render and guard tests for every new affordance: single-descriptor law, coverage guards, compact variants; `frontend/src/app`.

### Phase `W03.P08` - Cruft deletion and closeout (D7)

Delete the unmounted right-rail components, mirror the new affordances into the binding design file, and run the full epic gate.

- [ ] `W03.P08.S28` - Delete the unmounted Inspector, NowStrip, and DocHeader components together with their render tests; `frontend/src/app/right`.
- [ ] `W03.P08.S29` - Mirror the new affordances into the binding design file or record the deliberate divergence; `FRAMES.md`.
- [ ] `W03.P08.S30` - Run the full epic gate for both languages and persist the closeout summary; `.vault/exec/2026-07-12-authoring-surface`.

## Description

Execute the authoring-surface ADR: surface every built authoring capability in
the dashboard UI with modern touch/click/keyboard-parity UX. Three waves land,
in order, the two net-new backend seams (the ledgered plan-step tick capability
and the section-anchored comments plane in the authoring store), the frontend
surfaces that consume them (stores wiring, the actionable plan-step checkbox,
the reader's right-side heading comment affordances and thread panel), and the
closing polish set (in-editor draft-vs-saved diff, accelerator hints, the
copy-link verb, visible create buttons across empty state and rail, the
corpus-fed feature combobox, and deletion of the orphaned right-rail
components). The authorizing decisions D1 through D7, their considered
alternatives, and the honest constraints (weaker plan-tick concurrency fence,
heading-section comment granularity, single-principal attribution) live in the
ADR in this plan's related chain, grounded by the same-feature research.

## Steps

## Parallelization

Waves are sequenced: W01 backend seams must land and pass their engine tests
before W02 consumes them, and W02's stores wiring (P03) must land before P04
and P05 mount UI on those hooks. Within W01, P01 and P02 are independent EXCEPT
both touch the authoring HTTP surface (S03 and S07 edit the same route file) -
execute those two steps serially or in one lane. Within W02, P04 and P05 are
parallel after P03. W03 phases are mutually independent and parallelizable;
inside P07 every step touches a distinct file except the shared guard-test
step S27, which runs last. P08 is strictly terminal. One executor lane per
phase is the safe default in the shared worktree; the orchestrator owns all
git operations.

## Verification

- A plan step ticked from the status rail lands as a ledgered changeset with
  provenance, flips the served done state after re-ingest, and refuses a
  stale-base tick with a typed conflict (engine integration tests + live-wire
  frontend test).
- A comment created on a heading section persists across reload, lists
  bounded, attributes the actor ref, and serves as orphaned (never silently
  re-anchored) after the section is edited (engine tests + render tests).
- The reader shows the comment affordance on hover at pointer viewports and
  always on compact; every new verb is reachable by touch, click, and
  keyboard through the unified action plane (guard tests).
- The editor diff toggle renders draft-vs-saved hunks with zero new wire
  calls.
- New-document is visibly reachable from the empty state and the rail header,
  and the create dialog's feature field autocompletes the live corpus while
  accepting new tags.
- The orphaned right-rail components are gone; no import remains.
- Full gates green at every phase boundary: just dev lint frontend for
  UI-only phases, just dev lint all for W01 and the closeout; the complete
  vitest suite and engine test binaries pass at wave boundaries.
- Mandatory adversarial code review after execution; every review finding
  resolved or explicitly accepted before closeout.
