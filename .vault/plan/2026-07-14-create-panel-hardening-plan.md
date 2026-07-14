---
tags:
  - '#plan'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
tier: L2
related:
  - '[[2026-07-14-create-panel-hardening-audit]]'
  - '[[2026-07-14-feature-group-authoring-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `create-panel-hardening` plan

### Phase `P01` - Shared primitive hardening

Fix the Dialog and AutocompleteCombobox once for every consumer: pinned non-scrolling footer slot with safe-area inset, reduced-motion gating, focused-field scroll-into-view; short-viewport listbox containment, option touch floor, aria-controls hygiene. Every existing consumer suite stays green.


<!-- One-line headline summary plan. -->

- [ ] `P01.S01` - Grow the Dialog a pinned non-scrolling footer slot (safe-area inset), gate its open animations on prefers-reduced-motion, and scroll the focused field into view within the body; `frontend/src/app/chrome/Dialog.tsx`.
- [ ] `P01.S02` - Contain the combobox listbox on short viewports (portal or space-aware max-height), raise option rows to the touch floor, and render aria-controls only when the listbox exists; `frontend/src/app/viewer/AutocompleteCombobox.tsx`.
- [ ] `P01.S03` - Update or add primitive render tests for the footer slot, reduced-motion gate, and listbox containment, and re-run every existing Dialog and combobox consumer suite green; `frontend/src/app/chrome and consumer test suites`.

### Phase `P02` - Panel keyboard and accessibility pass

Close the audit's panel-level HIGH/MEDIUM findings in CreateDocDialog and its chrome store: stage-keyed focus, default initial focus, aria-disabled reasons with full roving, live announcements, draft preservation across dismiss, target sizes, select-text, caption tokens.

- [ ] `P02.S04` - Move focus deterministically on stage transitions, default initial focus to the feature combobox for every entry point, and announce the stage change; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `P02.S05` - Make ineligible type rows aria-disabled and roving-included with their served reason associated via aria-describedby, add Home and End, and follow focus when reconcile moves the selection; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `P02.S06` - Preserve the create draft across dismiss and reset it only on successful create, with store unit tests; `frontend/src/stores/view/createDocChrome.ts`.
- [ ] `P02.S07` - Raise the chip-remove and back affordances to the touch floor, mark stems select-text, put a polite live region on the coverage card, and move information-bearing small captions off ink-faint; `frontend/src/app/left/CreateDocDialog.tsx`.

### Phase `P03` - Compact verification and closeout

Lock the compact presentation and every fixed behavior with tests (viewport-class compact suite, keyboard/focus regressions), then the full gate and review.

- [ ] `P03.S08` - Author the compact render suite (viewport-class driven): footer reachability with constrained height, listbox containment, touch-target floors, and the 320-width presentation; `frontend/src/app/left/CreateDocDialog.compact.render.test.tsx`.
- [ ] `P03.S09` - Add keyboard and announcement regression tests: stage-transition focus, default initial focus, aria-disabled reason reachability, Home and End, draft preservation on Escape; `frontend/src/app/left/CreateDocDialog.render.test.tsx`.
- [ ] `P03.S10` - Run the full lint gate for the frontend and vault check all, confirm exit 0 for our lane, and route the phase set to code review; `just dev lint frontend`.

### Phase `P04` - Follow-on delivery: prerequisite affordance, link re-add, ink-faint ruling

Deliver the three items the audit deferred, per user direction: the ADR D3 one-click path to the missing prerequisite, keyboard-recoverable link re-add, and the systemic ink-faint small-text ruling with app-wide remediation of information-bearing usages.

- [ ] `P04.S11` - Add the one-click prerequisite affordance on ineligible type rows: activating the reason selects and focuses the missing upstream type (ADR D3's promised path); `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `P04.S12` - Add a corpus-fed add-link affordance to the Linked documents row so removed links are keyboard-recoverable, reusing the shared combobox over the linking corpus; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `P04.S13` - Record the ink-faint ruling in the token ledger (large-text and decorative only) and re-token every information-bearing small-text ink-faint usage app-wide to a passing ink; `frontend/src/styles.css and surveyed usage sites`.
- [ ] `P04.S14` - Extend the render and store tests for the prerequisite affordance and link re-add, and re-run the full frontend gate and vault check green; `frontend/src/app/left/CreateDocDialog.render.test.tsx`.

## Description

Remediation plan for the create-panel hardening audit (related frontmatter):
mobile/compact rendering, keyboard navigation, and accessibility. The audit
found four HIGH defects - the Create footer scrolls behind the soft
keyboard, the panel has no verified compact path, focus is dropped across
stage transitions, and ineligible-type reasons are unreachable to
keyboard/screen-reader users - plus MEDIUM/LOW findings across live
announcements, draft loss on dismiss, touch-target floors, listbox
clipping, and caption contrast. The design ruling stands: the approved
compact frame is a narrow centered modal, so fixes land inside the Dialog
primitive and the panel, not as a sheet fork. Named follow-ons excluded
from this plan: the ADR D3 one-click-prerequisite affordance, keyboard
re-add for removed links, the systemic ink-faint ruling.

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

P01 (primitives) and P02 (panel/store behavior) share no files EXCEPT that
the panel adopts the P01 footer slot - S04/S05/S07 may start in parallel
with P01 but the footer adoption in the panel waits for P01.S01's slot
shape; S06 (store) is fully independent. P03 is sequential after both
(tests lock the fixed behavior). Within phases, steps are ordered.

## Verification

- Every audit HIGH closed and test-locked: pinned footer reachable with
  constrained viewport height; compact presentation asserted by the
  viewport-class suite; stage-transition focus placement asserted;
  aria-disabled reasons reachable by roving and announced.
- Every MEDIUM closed or explicitly re-triaged in the step records; the
  named follow-ons stay out of scope.
- Primitive changes verified against ALL existing Dialog/combobox consumer
  suites (no regression in SettingsDialog, ConfirmDialog, AddProjectDialog,
  editor comboboxes).
- Full frontend gate exit 0 for this lane; vault check free of new
  findings; every phase adversarially reviewed and APPROVED before its
  commit; the audit document updated with resolution states at closeout.
