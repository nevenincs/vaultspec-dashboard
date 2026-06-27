---
tags:
  - '#plan'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-06-22'
tier: L2
related:
  - '[[2026-06-16-status-overview-adr]]'
  - '[[2026-06-16-status-overview-research]]'
---
# `status-overview` plan

### Phase `P01` - Engine /history route

Add the bounded, read-only, enveloped GET /history?scope=&limit=N route serving commit hash+subject newest-first.

- [x] `P01.S01` - Add subject to CommitEvent and serve GET /history with bounded commit list, tiers, truncated block; `engine tests; `engine/crates/vaultspec-api/src/routes/history.rs`.

### Phase `P02` - Stores history query + mock fidelity

Add the bounded history query (gcTime cap, tiers-derived degradation) and mirror the wire shape in the mock with a fidelity test.

- [x] `P02.S02` - Add bounded useHistory query + deriveHistoryView (tiers-gated), engine client + adapter, mock /history route + fidelity test; `frontend/src/stores/server/queries.ts`.

### Phase `P03` - Status tab UI + rail IA

Build the dumb Status tab (location anchor, open plans with step-tree expand + open-in-viewer, recent commits) and refine the rail tab set.

- [x] `P03.S03` - Build StatusTab (location anchor + open plans w/ step-tree expand + open-in-viewer + recent commits), wire into rail IA; `frontend/src/app/right/StatusTab.tsx`.

### Phase `P04` - Tests + review

Component tests across light/dark/HC, full lint gate, code review to PASS.

- [x] `P04.S04` - Component tests (anchor, expansion, commits, open-in-viewer, themes), full lint gate, code review; `frontend/src/app/right/StatusTab.render.test.tsx`.

## Description

## Steps

## Parallelization

## Verification
