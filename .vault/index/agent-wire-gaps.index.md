---
generated: true
tags:
  - '#index'
  - '#agent-wire-gaps'
date: '2026-07-18'
modified: '2026-07-18'
related:
  - '[[2026-07-17-agent-wire-gaps-P01-S13]]'
  - '[[2026-07-17-agent-wire-gaps-P02-S15]]'
  - '[[2026-07-17-agent-wire-gaps-P02-S16]]'
  - '[[2026-07-17-agent-wire-gaps-P02-S17]]'
  - '[[2026-07-17-agent-wire-gaps-P02-S18]]'
  - '[[2026-07-17-agent-wire-gaps-P02-S19]]'
  - '[[2026-07-17-agent-wire-gaps-P02-S20]]'
  - '[[2026-07-17-agent-wire-gaps-P02-S21]]'
  - '[[2026-07-17-agent-wire-gaps-P03-S22]]'
  - '[[2026-07-17-agent-wire-gaps-P03-S23]]'
  - '[[2026-07-17-agent-wire-gaps-P03-S24]]'
  - '[[2026-07-17-agent-wire-gaps-P03-S25]]'
  - '[[2026-07-17-agent-wire-gaps-P03-S26]]'
  - '[[2026-07-17-agent-wire-gaps-P03-S27]]'
  - '[[2026-07-17-agent-wire-gaps-P03-S28]]'
  - '[[2026-07-17-agent-wire-gaps-P04-S34]]'
  - '[[2026-07-17-agent-wire-gaps-P04-S35]]'
  - '[[2026-07-17-agent-wire-gaps-P04-S36]]'
  - '[[2026-07-17-agent-wire-gaps-P05-S37]]'
  - '[[2026-07-17-agent-wire-gaps-P05-S39]]'
  - '[[2026-07-17-agent-wire-gaps-P05-S40]]'
  - '[[2026-07-17-agent-wire-gaps-P05-S42]]'
  - '[[2026-07-17-agent-wire-gaps-P05-S44]]'
  - '[[2026-07-17-agent-wire-gaps-P05-S48]]'
  - '[[2026-07-17-agent-wire-gaps-adr]]'
  - '[[2026-07-17-agent-wire-gaps-audit]]'
  - '[[2026-07-17-agent-wire-gaps-plan]]'
---

# `agent-wire-gaps` feature index

Auto-generated index of all documents tagged with `#agent-wire-gaps`.

## Documents

### adr

- `2026-07-17-agent-wire-gaps-adr` - `agent-wire-gaps` adr: `engine wire-gap closure for the authoring agent plane` | (**status:** `accepted`)

### audit

- `2026-07-17-agent-wire-gaps-audit` - `agent-wire-gaps` audit: `P01 run lifecycle, cancel semantics, and queued-turn review`

### exec

- `2026-07-17-agent-wire-gaps-P02-S15` - Expose the existing interrupts_for_run(run_id, cap) store query for the new read route, serving raise-order results as already returned, with pending entries flagged and a truncated marker at INTERRUPT_LIST_CAP=50, rather than adding a new store query
- `2026-07-17-agent-wire-gaps-P02-S16` - Define the typed per-kind decision schema mirroring ToolPermissionDecisionRequest (decision: approve or deny, optional comment) and a decision_unreadable degradation marker for legacy opaque decisions
- `2026-07-17-agent-wire-gaps-P02-S17` - Wire the GET /v1/runs/{run_id}/interrupts route over the existing store query, serving interrupt_id, run_id, kind, tool_call_id, resume_state, timestamps, and the typed decision projection
- `2026-07-17-agent-wire-gaps-P02-S18` - Narrow InterruptResumeRequest's opaque payload to the same typed decision schema in the same cutover, leaving the resume-by-id route otherwise unchanged
- `2026-07-17-agent-wire-gaps-P02-S19` - Write tests covering the raise-order capped/truncation-marked list with pending entries flagged, the typed decision round-tripping the permission-decision write, a legacy opaque decision serving decision_unreadable without failing the page, and a live-test recovery case: a client that drops the /execute awaiting_permission response recovers the pending interrupt from the list
- `2026-07-17-agent-wire-gaps-P02-S20` - Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review
- `2026-07-17-agent-wire-gaps-P02-S21` - Route Phase P02 to the team reviewer for verification against the D3 acceptance criteria
- `2026-07-17-agent-wire-gaps-P03-S22` - Add optional run_id/turn_id fields to the changeset revision input and ledger record, stamped at tool-executor dispatch where ExecuteToolCallRequest already carries run_id and the turn joins through the run record
- `2026-07-17-agent-wire-gaps-P03-S23` - Flow the stamped run_id/turn_id provenance through create_proposal into the ledger record, with human/direct changesets carrying None
- `2026-07-17-agent-wire-gaps-P03-S24` - Add session_id, run_id, and turn_id optional fields to ProposalProjection, exposing the session_id the changeset revision already stores internally
- `2026-07-17-agent-wire-gaps-P03-S25` - Wire the GET /v1/mode route serving the active workspace scope's OperationModeRecord (mode, scope_id, setting actor, updated_at_ms) off the store's existing current_record resolution, matching the write path's default-record behavior
- `2026-07-17-agent-wire-gaps-P03-S26` - Write tests covering the projection serving session_id/run_id/turn_id for a tool-dispatched proposal and None for a human one, pre-migration record deserialization, and GET /v1/mode round-tripping POST /v1/mode including the default record on a fresh store
- `2026-07-17-agent-wire-gaps-P03-S27` - Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review
- `2026-07-17-agent-wire-gaps-P03-S28` - Route Phase P03 to the team reviewer for verification against the D4/D5 acceptance criteria
- `2026-07-17-agent-wire-gaps-P04-S34` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Write tests covering batch immutability under later comment edits, cap and byte-bound enforcement, typed turn-reference fence violations, and the turn record carrying the batch id
- `2026-07-17-agent-wire-gaps-P04-S35` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review
- `2026-07-17-agent-wire-gaps-P04-S36` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Route Phase P04 to the team reviewer for verification against the D7 acceptance criteria
- `2026-07-17-agent-wire-gaps-P05-S37` - Add SSE adapter cases for the two remaining lifecycle event kinds, turn.queued and session.cancelled (run.completed was already consumed with terminal-aware invalidation by commit 506daa04a2). Verify the shipped run.completed adapter case renders a janitor-reaped run (outcome failed, reason abandoned) honestly as Failed, needing no separate adapter arm
- `2026-07-17-agent-wire-gaps-P05-S39` - Delete the client one-slot queue chip rendering and read queued state from the session snapshot's queued_turn_ids instead
- `2026-07-17-agent-wire-gaps-P05-S40` - Render transcript Done and Failed terminal states from run.completed instead of the relay-gap seam placeholder
- `2026-07-17-agent-wire-gaps-P05-S42` - Retire the session-actor-latest correlation mark and bind the inline proposal card to its proposal's served run_id
- `2026-07-17-agent-wire-gaps-P05-S44` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04.S12 - do not execute from this plan unless that plan releases it] Ride the composer's staged comment batch along as a feedback_batch_id created via POST /v1/feedback-batches on submit, recorded on the turn alongside the existing serialized prompt block
- `2026-07-17-agent-wire-gaps-P05-S48` - Route Phase P05 to the team reviewer for verification against the frontend cutover acceptance criteria
- `2026-07-17-agent-wire-gaps-P01-S13` - Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review

### plan

- `2026-07-17-agent-wire-gaps-plan` - `agent-wire-gaps` plan
