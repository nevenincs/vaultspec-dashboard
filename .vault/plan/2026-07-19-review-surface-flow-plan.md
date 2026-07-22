---
tags:
  - '#plan'
  - '#review-surface-flow'
date: '2026-07-19'
modified: '2026-07-21'
tier: L2
related:
  - '[[2026-07-19-review-surface-flow-adr]]'
  - '[[2026-07-19-review-surface-flow-research]]'
---
# `review-surface-flow` plan

### Phase `P01` - Scope-level mode read

Close the wire gap in-repo. Serve the effective worktree operation mode so the autonomy control can render before any proposal exists. Engine-first and parallel-safe.

- [x] `P01.S01` - Add GET /v1/mode serving the effective worktree operation mode with an explicit default and the standard tiers envelope; `engine/crates/vaultspec-api/src/authoring/modes.rs`.
- [x] `P01.S02` - Test default-mode read and set-then-read round-trip over the live serve; `engine/crates/vaultspec-api/src/authoring/http/tests/group2.rs`.
- [x] `P01.S03` - Add the useOperationMode served read and prefer it over the proposal-derived mode fallback; `frontend/src/stores/server/authoring/index.ts`.

### Phase `P02` - De-modalize the review surface

Fold the standalone review queue into the Agent panel as a Pending changes view and delete the Approvals modal, re-routing the footer chip under the same action id.

- [x] `P02.S04` - Add panelView transcript-or-pending state and openAgentPanel view targeting; `frontend/src/stores/view/agentPanel.ts`.
- [x] `P02.S05` - Build PendingChangesView hosting the queue body and add the panel header view switcher; `frontend/src/app/agent/PendingChangesView.tsx`.
- [x] `P02.S06` - Delete approvals from the modal control-panel host and re-route the footer Review chip under the same action id; `frontend/src/app/panels/ControlPanels.tsx`.
- [x] `P02.S07` - Migrate the approvals-bound guard and render tests to the new pending view; `frontend/src/app/panels/ControlPanels.guard.test.tsx`.

### Phase `P03` - Relocate autonomy and bridge the flow

Mount AutonomyControl composer-adjacent in the Agent panel and add the out-of-session Pending-changes bridge affordance above the composer.

- [x] `P03.S08` - Mount AutonomyControl composer-adjacent and remove the station-side mount; `frontend/src/app/agent/AgentPanel.tsx`.
- [x] `P03.S09` - Build PendingChangesBridge with an exported pure out-of-session derivation that is truncation-honest; `frontend/src/app/agent/PendingChangesBridge.tsx`.
- [x] `P03.S10` - Add render and unit tests for the bridge derivation and the autonomy placement; `frontend/src/app/agent/PendingChangesBridge.test.tsx`.

### Phase `P04` - Assembled-app verification and closeout

Live-drive the assembled app to prove all acceptance criteria, run the full gate, and record Figma follow-on debt.

- [x] `P04.S11` - Live-drive the assembled app to prove the acceptance criteria and persist the screenshots; `frontend/src/testing/review-surface-flow.live-drive.cjs`.
- [x] `P04.S12` - Run the full lint and live-wire gate and record the Figma follow-on frame debt; `frontend/package.json`.

## Description

## Steps

## Parallelization

## Verification
