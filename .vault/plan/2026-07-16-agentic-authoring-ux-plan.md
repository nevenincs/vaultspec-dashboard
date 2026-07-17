---
tags:
  - '#plan'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-17'
tier: L3
related:
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-research]]'
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

<!-- RETIRED: S01 -->

# `agentic-authoring-ux` plan

## Wave `W01` - Detangle and unify

Pure simplification before growth: collapse the two diff renderers into one primitive, delete the sign-in gate, make provenance ambient, and rename/ungate the Review dialog (ADR P1/D5/D7).

### Phase `W01.P01` - Diff unification and review detangle

Collapse both diff renderers into one DiffView; delete the ReviewerIdentity sign-in gate and move token bootstrap to an ambient stores seam; rename/ungate the Review dialog.

- [x] `W01.P01.S02` - Create one DiffView primitive parameterized by source (draft-vs-saved or proposal-preview) with a single diffLines/diffStat implementation; `route both call sites through it and delete the duplicate renderer (D7); `frontend/src/app/authoring/DiffView.tsx`.
- [x] `W01.P01.S03` - Delete the ReviewerIdentity sign-in UI and all auth vocabulary; `move the actor-token bootstrap to an ambient lazy mint fired by the first mutating intent (D5); `frontend/src/stores/server/authoring/index.ts`.
- [x] `W01.P01.S04` - Rename and ungate the Review dialog (Approvals to Review); `add the grep-guard asserting no Sign in vocabulary remains in frontend/src (D5); `frontend/src/app/panels/ControlPanels.tsx`.
- [x] `W01.P01.S05` - Run the full gate and live-wire suite, route the W01 diff through code review, and persist the audit; `frontend/`.

## Wave `W02` - The keystone shell

The docked Agent panel, footer chip, and composer keystone over a new stores/server/agent slice; SSE adapter cases for the dropped session/run events; the agent ActionDescriptors (ADR P2/D1/D2/D8/D9).

### Phase `W02.P02` - Panel, composer, and agent wire slice

Mount the docked Agent panel + collapsed footer chip; build the composer (slash, @-mention chips, Model/Team selectors); add the stores/server/agent slice with sessions/turns + SSE adapter cases; enroll the agent ActionDescriptors with vetted chords.

- [x] `W02.P02.S06` - Author the binding Figma frames for the Agent panel, collapsed footer chip, and composer before build (D1/D2); `figma:SlhonORmySdoSMTQgDWw3w`.
- [x] `W02.P02.S07` - Add the bounded stores/server/agent slice: the sole wire client for sessions/turns/runs/interrupts/agent-tools with query keys and bounded caches (D9); `frontend/src/stores/server/agent`.
- [x] `W02.P02.S08` - Add SSE adapter cases for the dropped session.created and run.started lifecycle events (D3); `frontend/src/stores/server/liveAdapters`.
- [x] `W02.P02.S09` - Build the docked Agent panel mounted once in AppShell plus the collapsed footer status chip in the FrameworkStatusCluster grammar (D1); `frontend/src/app/agent/AgentPanel.tsx`.
- [x] `W02.P02.S10` - Build the composer: multiline Enter-to-send with Shift+Enter newline, slash popover from the one command registry, at-mention chips over AutocompleteCombobox resolving vault features/documents, small adjacent Model and Team selectors (D2); `frontend/src/app/agent/Composer.tsx`.
- [x] `W02.P02.S11` - Enroll the agent ActionDescriptors (toggle-panel, stop-run, new-session) across palette/keymap/menus; `vet Mod+Alt+A against the reserved-chord denylist with a citation (D8); `frontend/src/stores/view/agentActions.ts`.
- [x] `W02.P02.S12` - Run the full gate and live-wire suite, route the W02 shell and composer through code review, and persist the audit; `frontend/`.

## Wave `W03` - The live transcript

Tool-call, thinking, and inline permission entries; stop, steer-via-composer, and the one-slot queued prompt; the inline proposal card consuming the unified DiffView (ADR P3/D3/D4).

### Phase `W03.P03` - Transcript, streaming, and inline review

Fixed-order turn transcript; collapsed tool-call/thinking/permission entries; stop/steer/queued-prompt; inline proposal card on the unified DiffView.

- [x] `W03.P03.S13` - Build the fixed-order turn transcript (user prompt then thinking then tool calls then final text) with collapse-on-settle and a bounded retained window (D3); `frontend/src/app/agent/Transcript.tsx`.
- [x] `W03.P03.S14` - Build the collapsed-by-default tool-call entry with per-call served status, the dimmed cost-labeled thinking block, and the inline tool-permission prompt wired to permission-decision (D3); `frontend/src/app/agent/ToolCallEntry.tsx`.
- [x] `W03.P03.S15` - Add the Stop button (wire runs/cancel), steer-via-composer (interrupt resume while parked), and the one-slot queued-prompt chip dispatched on run settle (D4); `frontend/src/app/agent/Composer.tsx`.
- [x] `W03.P03.S16` - Build the inline proposal card (served summary, change count, Show-changes via DiffView, eligibility-driven Approve/Reject/Apply) as the preview-then-approve happy path (D5); `frontend/src/app/agent/ProposalCard.tsx`.
- [x] `W03.P03.S17` - Run the full gate and live-wire suite, route the W03 transcript through code review, and persist the audit; `frontend/`.

## Wave `W04` - The bridge and mode

Comment-to-agent attachment executing the accepted agentic-feedback-loop ADR frontend-side, and the operation-mode control (ADR P4/D5/D6).

### Phase `W04.P04` - Comment bridge and autonomy control

Comment-to-agent attachment (the accepted feedback-loop ADR) via shared chip grammar + Send-to-agent action; the operation-mode control in the Review header.

- [x] `W04.P04.S18` - Add the Send-to-agent action and the N-comments removable chip in the composer using the shared mention-chip grammar, executing the accepted feedback-loop ADR frontend-side (D6); `frontend/src/app/viewer/CommentThreadPanel.tsx`.
- [x] `W04.P04.S19` - Add the operation-mode control in the Review header wired to POST mode, rendering served mode tokens as plain labels (D5); `frontend/src/app/authoring/ReviewStation.tsx`.
- [x] `W04.P04.S20` - Run the full gate and live-wire suite, route the W04 bridge and mode through code review, and persist the audit; `frontend/`.

## Wave `W05` - a2a enrichment

Cross-team gated: Team selector on presets-list, team run wiring, and relayed-SSE-channel consumption once the a2a team ships its side (ADR P5/D9).

### Phase `W05.P05` - a2a team runs and relay

Team selector on presets-list, team run-start/status/cancel wiring, and relayed-SSE-channel consumption; gated on the a2a team's build.

- [x] `W05.P05.S21` - Wire the Team selector to the a2a presets-list pass-through and team run-start/status/cancel, degraded disabled-with-reason from tiers when a2a is down (D9); `frontend/src/stores/server/agent`.
- [x] `W05.P05.S22` - Consume the a2a relayed SSE channel for token/tool-call frames once the a2a team ships it, with bounded run-status polling fallback (D3/D9); `frontend/src/stores/server/liveAdapters`.
- [ ] `W05.P05.S23` - Run the full gate and live-wire suite, route the W05 a2a wiring through code review, and persist the audit; `frontend/`.

## Description

## Steps

## Parallelization

## Verification
