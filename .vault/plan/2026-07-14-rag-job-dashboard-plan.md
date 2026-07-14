---
tags:
  - '#plan'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
tier: L3
related:
  - '[[2026-07-14-rag-job-dashboard-adr]]'
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
     Replace rag-job-dashboard with a kebab-case feature tag, e.g. #foo-bar.
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

# `rag-job-dashboard` plan

## Wave `W01` - Design and contract

The Figma dashboard frame set and the stores/contract plane land in parallel: every dashboard element becomes a bound Kit-composed frame (ADR D6), while the logs read is verified end-to-end and the jobs/logs/dashboard view derivations are built (ADR D3/D4/D7). W02 depends on both phases of this wave. Authorized by the rag-job-dashboard ADR and research.

<!-- One-line headline summary plan. -->

### Phase `W01.P01` - Figma dashboard frames

Every dashboard element as bound frames in the binding file: the wide panel shell with header and footer bars, the job table with row states and controls, the log pane, and the footer storage strip (ADR D6).

- [x] `W01.P01.S01` - Design the wide dashboard panel shell frame - header bar (identity, health word, lifecycle verbs, reindex progress) over a scrollable body over a footer bar - Kit-composed on the token scale; `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard shell`.
- [x] `W01.P01.S02` - Design the job table frames - column header row with sort marks, row states (queued, running with progress, done, failed), the filter query field, and the phase facet chips; `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard jobs region`.
- [x] `W01.P01.S03` - Design the log pane frames (monospace rows with level tones, lines selector, job-filter chip, empty and offline states) and the footer storage strip (points, footprint, tenant counts with live and orphaned split, truncation note, watcher toggle); `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard log and footer`.

### Phase `W01.P02` - Contract and stores plane

Verify the brokered logs read forwards its params end-to-end, add the typed client method and the bounded useRagLogs hook, and derive the jobs view and the dashboard view-state store (ADR D3/D4/D7).

- [x] `W01.P02.S04` - Verify the brokered logs read forwards lines and job_id end-to-end against the live engine, add the typed opsRagLogs client method, and apply the params-only passthrough fix on the engine route if params are dropped; `frontend/src/stores/server/engine/client.ts`.
- [x] `W01.P02.S05` - Create the bounded useRagLogs stores hook - lines cap, job filter, poll only while consumed, tiers-gated offline truth - with live-wire tests; `frontend/src/stores/server/ragControl.ts`.
- [x] `W01.P02.S06` - Derive the jobs table view (sort by recency or duration, text query, phase facets, served-bound truncation honesty) as pure functions with unit tests; `frontend/src/stores/server/ragDashboardView.ts`.
- [x] `W01.P02.S07` - Create the bounded dashboard view-state store - sort key, phase facet, filter texts, selected job, lines choice - view-local presentation state with unit tests; `frontend/src/stores/view/ragDashboard.ts`.

## Wave `W02` - Dashboard chrome

The wide-dialog dashboard surface is built over the W01 frames and stores plane: the shell with header bar, then the jobs, log, and footer regions as parallel lanes (ADR D1-D5). W03 depends on this wave. Authorized by the rag-job-dashboard ADR.

### Phase `W02.P03` - Shell and header bar

The Dialog wide variant and the dashboard shell with the header bar: identity, health, lifecycle verbs, reindex with progress (ADR D1/D2).

- [x] `W02.P03.S08` - Add the wide size variant to the one Dialog primitive with a render test; `frontend/src/app/chrome/Dialog.tsx`.
- [x] `W02.P03.S09` - Build the dashboard shell and header bar mirroring the bound frame and mount it as the Search service panel body, retiring the re-hosted console composition; `frontend/src/app/panels/RagJobDashboard.tsx`.

### Phase `W02.P04` - Jobs, log, and footer regions

The sortable filterable job table, the log pane with the job join and lines selector, and the footer storage strip with watcher control (ADR D3/D4/D5).

- [x] `W02.P04.S10` - Build the jobs table region - sortable columns, filter query, phase chips, row selection joining the log pane, truncation note; `frontend/src/app/panels/RagJobsTable.tsx`.
- [x] `W02.P04.S11` - Build the log pane region - bounded tail, lines selector, job-filter chip, client text filter honest about the served window, level tones; `frontend/src/app/panels/RagLogPane.tsx`.
- [x] `W02.P04.S12` - Build the footer storage strip - storage rollup with lower-bound honesty, watcher state and toggle, refresh; `frontend/src/app/panels/RagDashboardFooter.tsx`.

## Wave `W03` - Hardening and closeout

Designed state parity, compact collapse, test re-anchoring off the retired console composition, the full gate, and the adversarial review with revisions (ADR D7 and the standing review mandate). Authorized by the rag-job-dashboard ADR.

### Phase `W03.P05` - States, tests, gate, review

Designed offline/empty/degraded parity and compact collapse, console test re-anchoring, the full gate, and the adversarial review with revisions.

- [x] `W03.P05.S13` - Verify designed offline, empty, degraded, and loading states across all regions and the compact single-column collapse; `frontend/src/app/panels/RagJobDashboard.tsx`.
- [x] `W03.P05.S14` - Re-anchor the retired console composition tests onto the dashboard regions and extend the panel guards; `frontend/src/app/panels`.
- [ ] `W03.P05.S15` - Run the full frontend gate and touched suites, verify Figma name-as-contract bindings, and route the feature through the adversarial review with revisions; `frontend`.

## Description

Deliver the rag job dashboard per the accepted same-feature ADR (D1-D7): the
Search service panel becomes a wide dashboard dialog with a header bar
(identity, health, lifecycle, reindex), a sortable filterable job table, a
bounded log pane over the never-consumed brokered logs read, and a footer
storage strip - every element Figma-designed first, all view state view-local
presentation, every read bounded and mount-gated, degradation tiers-read.
Grounded by the same-feature research (the codified contract already serves
everything; the one contract risk is logs param passthrough, verified first).

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

Waves are sequenced (W01 then W02 then W03). Inside W01, P01 (Figma, run by
the orchestrator) and P02 (stores/contract, one Opus lane) are fully parallel;
inside P02, S04 gates S05 (the hook needs the verified client method) while
S06/S07 are independent. Inside W02, P03 and P04 are parallel Opus lanes
except S09 consumes S08 (the wide Dialog variant lands first inside P03) and
P04's regions integrate into the S09 shell at the end of the wave. W03 is one
closing lane plus the orchestrator-run gate and the independent reviewer.
The orchestrator owns ALL git and plan bookkeeping; coders edit files only.

## Verification

- Every dashboard element exists as a bound frame in the binding file and
  code mirrors it (figma:names green; name-as-contract).
- The logs read is proven end-to-end against the live engine with lines and
  job_id honored; the hook polls only while the panel is open and holds no
  unbounded accumulation.
- Job sort/filter/facet operate over the served list with the truncation
  bound stated; selecting a job filters the log pane.
- Lifecycle, reindex, watcher, and refresh verbs dispatch through the one ops
  seam; offline renders the designed degraded states with
  disabled-with-reason verbs.
- No raw tiers reads, no corpus-filter writes, plain-language labels
  throughout; compact collapses to a single column.
- Full frontend gate green on the feature slice; touched suites green; the
  adversarial review signs off APPROVED with revisions landed. The plan is
  complete when every Step row is closed.
