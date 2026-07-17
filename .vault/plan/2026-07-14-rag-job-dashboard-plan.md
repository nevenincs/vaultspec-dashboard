---
tags:
  - '#plan'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
tier: L3
related:
  - '[[2026-07-14-rag-job-dashboard-adr]]'
  - '[[2026-07-14-rag-job-dashboard-research]]'
---
# `rag-job-dashboard` plan

## Wave `W01` - Design and contract

The Figma dashboard frame set and the stores/contract plane land in parallel: every dashboard element becomes a bound Kit-composed frame (ADR D6), while the logs read is verified end-to-end and the jobs/logs/dashboard view derivations are built (ADR D3/D4/D7). W02 depends on both phases of this wave. Authorized by the rag-job-dashboard ADR and research.

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
- [x] `W03.P05.S15` - Run the full frontend gate and touched suites, verify Figma name-as-contract bindings, and route the feature through the adversarial review with revisions; `frontend`.

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
