---
tags:
  - '#plan'
  - '#state-render-review'
date: '2026-07-02'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-02-state-render-review-audit]]'
  - '[[2026-06-17-dashboard-state-centralization-adr]]'
---

# `state-render-review` plan

### Phase `P01` - State-write correctness

Close the filter lost-update race and harden the in-selector derivations against the getSnapshot crash class.

- [x] `P01.S01` - SRR-001: serialize filter writes through the queued-chain shape already used for panel_state (compute the PATCH payload from the freshest cache inside the queued thunk) so rapid toggles cannot lost-update each other; `frontend/src/stores/server/dashboardState.ts`.
- [x] `P01.S02` - SRR-002: convert the 8 in-selector derivations (addProjectChrome:77, createDocChrome:146, worktreePickerChrome:228, selection:177, workingSet:99, editor:286, graphSync:134, ragControl:597) to select-raw + useMemo, and extend the local/stable-selectors lint rule to catch them; `frontend/src/stores/`.

### Phase `P02` - Minor hygiene and decisions

Document or gate the redundant dashboard-state invalidate and settle the view-local selection metadata.

- [x] `P02.S03` - SRR-003: document (or gate) the updateDashboardStateCache setQueryData + immediate invalidateQueries as a deliberate out-of-order convergence backstop; `frontend/src/stores/server/dashboardState.ts`.
- [x] `P02.S04` - SRR-004: promote viewStore.selection edge/event metadata into dashboard-state or re-document it as deliberately view-local; `frontend/src/stores/view/viewStore.ts`.

## Description

## Steps

## Parallelization

## Verification
