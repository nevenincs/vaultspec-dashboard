---
tags:
  - '#plan'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
tier: L2
related:
  - '[[2026-07-14-feature-group-authoring-adr]]'
  - '[[2026-07-14-feature-group-authoring-research]]'
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
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
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

# `feature-group-authoring` plan

### Phase `P01` - Figma panel design

Design the feature-group panel in the binding Figma file before any frontend rollout (ADR approval condition): both stages, coverage rows, disabled-type states, link chips, compact variant - composed from Kit atoms. User approval of the frames gates P04.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Audit the Kit atoms and existing dialog frames the panel composes, and inventory the panel's required states (feature select, coverage rows, eligible and disabled types, link chips, errors, compact); `Figma file SlhonORmySdoSMTQgDWw3w`.
- [x] `P01.S02` - Author the feature-group panel frames: stage 1 select-or-create feature with pipeline coverage rows, stage 2 add-document with eligible types, pre-filled editable link chips, disabled-with-reason states, and the compact variant; `Figma file SlhonORmySdoSMTQgDWw3w`.
- [x] `P01.S03` - Present the frames for user approval and record the approved frame ids (approval gates P04); `Figma file SlhonORmySdoSMTQgDWw3w`.

### Phase `P02` - Engine feature-coverage projection

Serve per-feature pipeline coverage (present types with newest stems, missing types, per-type eligibility, next-step token) as one bounded generation-memoized engine-query projection on the query plane (ADR D2/D3). May run parallel to P01.

- [x] `P02.S04` - Build the feature-coverage projection (present directory types with newest stem, missing types, per-type eligibility, next-step token) over the LinkageGraph, bounded and unit-tested, following the filter-vocabulary analogue; `engine/crates/engine-query/src/features.rs`.
- [x] `P02.S05` - Memoize the projection per graph generation on the corpus cell beside filters_vocabulary, invalidated on watcher rebuild; `engine cell memo site beside filters_vocabulary`.
- [x] `P02.S06` - Serve the coverage projection on the query plane with the shared envelope and tiers, scope-bound, with route tests; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `P03` - Stores seam and chrome state

One stores query for coverage keyed on scope+feature with tolerant adapters, and the createDocChrome store reworked to the staged feature-first shape with deterministic related pre-fill state (ADR D1/D5).

- [x] `P03.S07` - Add the feature-coverage stores query keyed on scope+feature with tolerant live-adapter parsing and honest degradation from tiers; `frontend/src/stores/server/queries`.
- [x] `P03.S08` - Rework the create-doc chrome store to the staged feature-first shape (feature stage, document stage, eligibility-aware type choice, editable related pre-fill derived from served coverage) with unit tests; `frontend/src/stores/view/createDocChrome.ts`.
- [x] `P03.S09` - Thread the related parameter from the staged submission through the existing create mutation and receipt-driven coverage invalidation; `frontend/src/stores/server/queries/mutations.ts`.

### Phase `P04` - Feature-group panel build

Rebuild the dialog as the two-stage feature-group panel mirroring the approved Figma frames: select-or-create feature with coverage rows, eligible-types-only document stage with editable link chips, exec removed, entry points pre-answering stage 1 (ADR D1/D3/D4/D5). Gated on P01 approval.

- [ ] `P04.S10` - Rebuild the dialog as the two-stage feature-group panel mirroring the approved frames: coverage rows, eligible-types-only choice with disabled-with-reason rows, editable link chips, honest same-day-duplicate refusal surfacing; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `P04.S11` - Remove bare exec from the offered types and pre-answer stage 1 from feature-scoped entry points (Features-section affordance, tree context menu); `frontend/src/app/left`.

### Phase `P05` - Guards, relabeling, and gate

Feature-first relabeling on the descriptor plane (ADR D6), guard and render test updates, full lint gate and vault check green.

- [ ] `P05.S12` - Relabel the new-document descriptors feature-first once on the descriptor plane, ids unchanged, so menu, palette, and keymap legend agree; `frontend/src/stores/view/graphCommands.ts and descriptor sites`.
- [ ] `P05.S13` - Update the affordance, palette, action-coverage guard tests and the dialog render tests to the staged panel; `frontend/src/app/newDocumentAffordances.guard.test.tsx and sibling guards`.
- [ ] `P05.S14` - Run the full lint gate for both languages and vault check all, and confirm exit 0 before review; `just dev lint all`.

## Description

Rebuild the New-document dialog as a feature-group panel per the accepted
feature-group-authoring ADR (see related frontmatter): a two-stage flow
(select-or-create feature with served pipeline coverage, then add an eligible
document with deterministically pre-filled cross-links), backed by one new
generation-memoized engine-query coverage projection. Bare exec creation
leaves the panel; descriptors are relabeled feature-first with ids unchanged.
The ADR's approval condition binds: the panel is designed in Figma and the
frames are user-approved before the panel chrome (P04) is built.

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

P01 (Figma design) and P02 (engine projection) share no files and run in
parallel. P03 depends on P02's served shape. P04 carries TWO hard gates: the
P01.S03 user approval of the frames and P03's chrome-store shape. P05 closes
sequentially after P04. Within each Phase, Steps are ordered.

## Verification

- P01.S03 records explicit user approval of the panel frames; no P04 work
  precedes it.
- Engine projection unit and route tests pass; the coverage response carries
  the shared envelope with tiers and is memoized per graph generation
  (repeat reads warm).
- Panel behavior verified by render tests: ineligible types disabled with
  reason, link chips pre-filled and editable, exec absent, feature-scoped
  entry points pre-answer stage 1, same-day-duplicate refusal surfaces
  honestly.
- Guard tests (new-document affordances, action coverage, command palette)
  green against the staged panel; descriptor ids unchanged.
- Full gate green: `just dev lint all` exit 0 and
  `vaultspec-core vault check all` free of new findings; reviewer sign-off
  via the code-review phase before the plan closes.
