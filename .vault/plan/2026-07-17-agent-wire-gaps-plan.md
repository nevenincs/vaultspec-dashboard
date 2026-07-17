---
tags:
  - '#plan'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
tier: L2
related:
  - '[[2026-07-17-agent-wire-gaps-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-research]]'
  - '[[2026-07-14-agentic-feedback-loop-adr]]'
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
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

<!-- RETIRED: S02, S03, S05, S49, S50 -->

# `agent-wire-gaps` plan

### Phase `P01` - Run completion and cancel-semantics cutover (D1+D2)

Extend the already-shipped run-completion vertical slice (CompleteRun/complete/run.completed, adopted at 19d845c499) with the remaining D1 substance (outcome enum, failure_reason, owner-only authorization, the Failed arm), plus run-scoped cancel, explicit session cancel, and the bounded FIFO queued-turn primitive as one coupled store and lifecycle change, including the single schema-version migration.

- [ ] `P01.S01` - Author the single new authoring schema-version migration adding queued-turn state, changeset run_id/turn_id provenance columns, and the feedback_batches table together as one additive version bump. The feedback_batches shape is authored here two phases before its consuming code lands in P04, so any shape change discovered at P04 time ships as a FRESH schema version bump, never an edit of this landed version, per the versioned-SQLite migration discipline; `engine/crates/vaultspec-api/src/authoring/store/schema.rs`.
- [ ] `P01.S04` - Extend the already-shipped CompleteRun/complete_run vertical slice (adopted at 19d845c499: POST /authoring/v1/runs/{run_id}/complete, lifecycle kind run.completed, idempotent terminal replay, session stays Active) rather than building a parallel route: add the bounded outcome enum (completed or failed) with an optional failure_reason (validated like the cancel reason, absent outcome defaults to completed to preserve the shipped callers), enforce owner-only authorization on the completing principal (or its delegator per the existing delegation guards, typed 403 otherwise), and add the RunStatus::Failed arm to the transition alongside the shipped Completed arm. Extend the existing run_completion test rather than duplicating it; `engine/crates/vaultspec-api/src/authoring/http/mod.rs`.
- [ ] `P01.S06` - Scope POST /v1/runs/{run_id}/cancel to the run only by deleting the session-cascade so the session stays Active while only the run transitions to Cancelled; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P01.S07` - Add the POST /v1/sessions/{session_id}/cancel command cancelling the session and its active run if one exists, emitting cancellation.recorded for the run and the new session.cancelled kind for the session. Session cancel VOIDS the queue as part of the same unit of work, so no queued turn is ever promoted into a cancelled session, and the voided turns remain readable as history but permanently non-runnable; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P01.S08` - Delete the mid-run JOIN arm of start_prompt_turn and persist a submitted turn during an active run as a queued PromptTurnRecord bounded by TURN_QUEUE_CAP=8 per session, with a typed 422 authoring_turn_queue_full on overflow; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P01.S09` - Add the queued command-outcome status alongside started, delete the joined status from the vocabulary, and emit turn.queued on enqueue; `engine/crates/vaultspec-api/src/authoring/api/mod.rs`.
- [ ] `P01.S10` - Implement atomic FIFO promotion of the oldest queued turn by turn_index into a fresh run inside the same unit of work as complete and cancel, emitting run.started exactly as a direct start does; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P01.S11` - Serve queued_turn_ids on the session snapshot so the client reads queued state explicitly instead of inferring it from run absence; `engine/crates/vaultspec-api/src/authoring/api/mod.rs`.
- [x] `P01.S38` - Delete the fresh-session-bootstrap-on-Stop behavior in the same phase as the engine's run-scoped cancel: Stop keeps calling POST /v1/runs/{run_id}/cancel unchanged, now observed via the existing cancellation.recorded case with the session staying Active, and a submit made during an active run dispatches through the served queued-turn state instead of a client one-slot queue; `frontend/src/stores/view/agentComposer.ts`.
- [ ] `P01.S12` - Extend the existing run_completion test to cover the outcome-enum extension, absent-outcome-defaults-to-completed, failure_reason validation, owner-only 403, the Failed arm, and one run.completed SSE delivery per completion, plus new tests for session-preserving run cancel, session-cancel dual-event emission, session-cancel voiding the queue (no promotion into a cancelled session, voided turns remain readable history and never runnable), queue-cap 422, FIFO promotion atomicity under a crash-injection between complete and promote, removal of the joined status from the codebase, and a live-test Stop-path scenario (Stop leaves the session Active, no fresh-session bootstrap fires, and the conversation continues); `engine/crates/vaultspec-api/src/authoring`.
- [ ] `P01.S13` - Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review; `engine`.
- [ ] `P01.S14` - Route Phase P01 to the team reviewer for verification against the D1/D2 acceptance criteria; `engine/crates/vaultspec-api/src/authoring`.

### Phase `P02` - Served interrupt state and typed decision schema (D3)

Expose the existing interrupts_for_run store query through a new bounded read route with a typed per-kind decision schema shared by the read and the existing resume write, degrading legacy opaque decisions honestly instead of failing the page.

- [x] `P02.S15` - Expose the existing interrupts_for_run(run_id, cap) store query for the new read route, serving raise-order results as already returned, with pending entries flagged and a truncated marker at INTERRUPT_LIST_CAP=50, rather than adding a new store query; `engine/crates/vaultspec-api/src/authoring/store`.
- [x] `P02.S16` - Define the typed per-kind decision schema mirroring ToolPermissionDecisionRequest (decision: approve or deny, optional comment) and a decision_unreadable degradation marker for legacy opaque decisions; `engine/crates/vaultspec-api/src/authoring/interrupts`.
- [x] `P02.S17` - Wire the GET /v1/runs/{run_id}/interrupts route over the existing store query, serving interrupt_id, run_id, kind, tool_call_id, resume_state, timestamps, and the typed decision projection; `engine/crates/vaultspec-api/src/authoring/http/mod.rs`.
- [x] `P02.S18` - Narrow InterruptResumeRequest's opaque payload to the same typed decision schema in the same cutover, leaving the resume-by-id route otherwise unchanged; `engine/crates/vaultspec-api/src/authoring/api/mod.rs`.
- [x] `P02.S19` - Write tests covering the raise-order capped/truncation-marked list with pending entries flagged, the typed decision round-tripping the permission-decision write, a legacy opaque decision serving decision_unreadable without failing the page, and a live-test recovery case: a client that drops the /execute awaiting_permission response recovers the pending interrupt from the list; `engine/crates/vaultspec-api/src/authoring`.
- [x] `P02.S20` - Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review; `engine`.
- [x] `P02.S21` - Route Phase P02 to the team reviewer for verification against the D3 acceptance criteria; `engine/crates/vaultspec-api/src/authoring`.

### Phase `P03` - Proposal-run correlation and scope-level mode read (D4+D5)

Stamp run/turn provenance on changesets at tool-executor dispatch, expose session_id on ProposalProjection, and add the scope-level GET /v1/mode read over the store's existing current_record resolution.

- [x] `P03.S22` - Add optional run_id/turn_id fields to the changeset revision input and ledger record, stamped at tool-executor dispatch where ExecuteToolCallRequest already carries run_id and the turn joins through the run record; `engine/crates/vaultspec-api/src/authoring/executor.rs`.
- [x] `P03.S23` - Flow the stamped run_id/turn_id provenance through create_proposal into the ledger record, with human/direct changesets carrying None; `engine/crates/vaultspec-api/src/authoring/executor.rs`.
- [x] `P03.S24` - Add session_id, run_id, and turn_id optional fields to ProposalProjection, exposing the session_id the changeset revision already stores internally; `engine/crates/vaultspec-api/src/authoring/api/mod.rs`.
- [x] `P03.S25` - Wire the GET /v1/mode route serving the active workspace scope's OperationModeRecord (mode, scope_id, setting actor, updated_at_ms) off the store's existing current_record resolution, matching the write path's default-record behavior; `engine/crates/vaultspec-api/src/authoring/http/mod.rs`.
- [x] `P03.S26` - Write tests covering the projection serving session_id/run_id/turn_id for a tool-dispatched proposal and None for a human one, pre-migration record deserialization, and GET /v1/mode round-tripping POST /v1/mode including the default record on a fresh store; `engine/crates/vaultspec-api/src/authoring`.
- [x] `P03.S27` - Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review; `engine`.
- [x] `P03.S28` - Route Phase P03 to the team reviewer for verification against the D4/D5 acceptance criteria; `engine/crates/vaultspec-api/src/authoring`.

### Phase `P04` - Structured feedback batch primitive (D7) [OWNED BY a2a-orchestration-edge P04]

[OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - every step in this phase duplicates that plan's P04 (S09-S12), which is actively executing and has already landed engine steps; do not execute this phase unless that plan releases the scope back here.] Introduce the immutable, digest-addressed feedback batch as durable engine state referenced by StartPromptTurnRequest and PromptTurnRecord, riding alongside the existing prose-serialized comment block.

- [ ] `P04.S29` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Add the feedback_batches store model over the P01-authored migration table: ordered comment ids capped at FEEDBACK_BATCH_COMMENT_CAP=32 with bodies, anchors, author identity, source revision, session id, optional general instruction, digest-addressed feedback_batch_id, and bounded total byte size; `engine/crates/vaultspec-api/src/authoring/store`.
- [ ] `P04.S30` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Wire the POST /v1/feedback-batches mutating command creating the immutable snapshot and rejecting any mutation after creation; `engine/crates/vaultspec-api/src/authoring/http/mod.rs`.
- [ ] `P04.S31` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Wire the GET /v1/feedback-batches/{feedback_batch_id} read route serving the snapshot; `engine/crates/vaultspec-api/src/authoring/http/mod.rs`.
- [ ] `P04.S32` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Add the optional feedback_batch_id field to StartPromptTurnRequest, verify batch existence, session ownership, and revision fences on submit, and record the reference on PromptTurnRecord; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04.S33` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Implement the retention posture: a batch registers as protected product state while referenced by a turn and becomes compactable after the turn's transcript window otherwise; `engine/crates/vaultspec-api/src/authoring/store`.
- [x] `P04.S34` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Write tests covering batch immutability under later comment edits, cap and byte-bound enforcement, typed turn-reference fence violations, and the turn record carrying the batch id; `engine/crates/vaultspec-api/src/authoring`.
- [x] `P04.S35` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review; `engine`.
- [x] `P04.S36` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Route Phase P04 to the team reviewer for verification against the D7 acceptance criteria; `engine/crates/vaultspec-api/src/authoring`.

### Phase `P04a` - Background janitor: bounded sweep for the genuinely undriven duties and run-reap (D1 abandoned-run reaping)

Build the one bounded, timed background janitor sweep and wire it to drive the genuinely undriven expiry seams (tool-permission expiry, interrupt reaping, lease expiry) plus the new run-reap duty D1 assigns to it; generation-transcript compaction is NOT a janitor duty (it already runs opportunistically inside every start_prompt_turn unit of work by deliberate prior decision), so the janitor at most runs a stated backstop sweep of the same bounded compact_due for a session that never receives another turn, never a second owner of compaction.

- [ ] `P04a.S51` - Build the janitor skeleton: one bounded, timed sweep loop with per-duty time budgets and wall-clock timeout discipline per the resource-bounds rule, no per-duty loops; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04a.S52` - Declare the janitor's config bounds at creation: RUN_STALE_AFTER_MS and the sweep cadence, both fixed at construction, no unbounded accumulation across sweeps; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04a.S53` - Wire the new run-reap duty into the sweep: an active run whose updated_at_ms exceeds RUN_STALE_AFTER_MS transitions to Failed with a distinct abandoned failure reason, emitting the same run.completed event as a reported completion; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04a.S54` - Add the janitor's compaction BACKSTOP: a stated sweep over the same bounded compact_due set used by the opportunistic per-turn compaction, for a session that never receives another turn. This is a backstop only, never a second owner of the compaction duty, which stays inside start_prompt_turn; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04a.S55` - Wire the existing tool-permission expiry duty into the sweep; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04a.S56` - Wire the existing interrupt reaping duty into the sweep; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04a.S57` - Wire the existing lease expiry duty into the sweep; `engine/crates/vaultspec-api/src/authoring/session`.
- [ ] `P04a.S58` - Write tests covering a stale active run reaped to Failed with the abandoned reason and exactly one run.completed emitted, a fresh active run left untouched by the sweep, each of the three genuinely undriven duties (tool-permission expiry, interrupt reaping, lease expiry) observably driven by the sweep, the compaction backstop sweep never double-compacting a session already compacted by its own per-turn path, and the sweep staying within its bounded budget under a large backlog; `engine/crates/vaultspec-api/src/authoring`.
- [ ] `P04a.S59` - Run the full lint gate (just dev lint all) and confirm exit 0 before routing the phase to review; `engine`.
- [ ] `P04a.S60` - Route the janitor phase to the team reviewer for verification against the single-janitor posture and the D1 abandoned-run acceptance criteria; `engine/crates/vaultspec-api/src/authoring`.

### Phase `P05` - Frontend cutovers onto the served wire shapes

Wire the dispatch-loop-finish call to the (already-shipped, D1-extended) complete route that D1's own unlock depends on, then delete the three remaining named frontend interims (client one-slot queue, client-staged interrupt annex, session-actor-latest correlation) and the proposal-gated mode control in favor of the served run.completed, turn.queued, session.cancelled, interrupt-list, correlation, and mode-read wire shapes. The fresh-session-bootstrap-on-Stop deletion ships structurally in P01, not here. The feedback-batch composer cutover (S44) is owned by the a2a plan's P04.S12, not executed from here.

- [x] `P05.S37` - Add SSE adapter cases for the two remaining lifecycle event kinds, turn.queued and session.cancelled (run.completed was already consumed with terminal-aware invalidation by commit 506daa04a2). Verify the shipped run.completed adapter case renders a janitor-reaped run (outcome failed, reason abandoned) honestly as Failed, needing no separate adapter arm; `frontend/src/stores/server/agent`.
- [x] `P05.S61` - Wire the frontend dispatch loop's finish (success and error paths) to call the already-shipped POST /authoring/v1/runs/{run_id}/complete with the completed or failed outcome, closing D1's own unlock: without this call no run ever completes, run.completed never fires from the client-driven loop, and Done/Failed can still never render even after the engine and adapter work land; `frontend/src/stores/view/agentComposer.ts`.
- [x] `P05.S39` - Delete the client one-slot queue chip rendering and read queued state from the session snapshot's queued_turn_ids instead; `frontend/src/app/agent`.
- [x] `P05.S40` - Render transcript Done and Failed terminal states from run.completed instead of the relay-gap seam placeholder; `frontend/src/stores/view/agentTranscript.ts`.
- [x] `P05.S41` - Delete the client-staged interrupt annex and fetch pending interrupts from GET /v1/runs/{run_id}/interrupts, wiring Approve/Deny through the narrowed typed decision payload; `frontend/src/stores/server/agent`.
- [x] `P05.S42` - Retire the session-actor-latest correlation mark and bind the inline proposal card to its proposal's served run_id; `frontend/src/app/agent`.
- [x] `P05.S43` - Move the AutonomyControl off proposal-gating onto GET /v1/mode so it renders pre-proposal; `frontend/src/app/agent`.
- [x] `P05.S44` - [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04.S12 - do not execute from this plan unless that plan releases it] Ride the composer's staged comment batch along as a feedback_batch_id created via POST /v1/feedback-batches on submit, recorded on the turn alongside the existing serialized prompt block; `frontend/src/stores/view/agentComposer.ts`.
- [x] `P05.S45` - Wire the new explicit POST /v1/sessions/{session_id}/cancel command for deliberately ending the conversation, leaving Stop's already-shipped P01 run-scoped cancel default unchanged; `frontend/src/stores/view/agentComposer.ts`.
- [x] `P05.S46` - Write and re-run the live-wire frontend suites covering the new run.completed/turn.queued/session.cancelled adapter cases, the dispatch-loop-finish complete call (the run actually completes and Done/Failed renders end to end), the queue chip and staged-interrupt-annex deletions, the correlation mark retirement, and the mode control's pre-proposal render; `frontend/src/stores/server/agent`.
- [x] `P05.S47` - Run the full lint gate (just dev lint frontend) and confirm exit 0 before routing the phase to review; `frontend`.
- [ ] `P05.S48` - Route Phase P05 to the team reviewer for verification against the frontend cutover acceptance criteria; `frontend/src/app/agent`.

## Description

Closes the seven engine wire-gaps decided by the accepted `agent-wire-gaps` ADR
(D1 through D7), each proven by a dated amendment in the agentic-authoring-ux
ADR during the W01-W04 build. D1's own vocabulary was superseded mid-review:
the a2a lane independently shipped D1's success arm as a vertical slice
(`CommandKind::CompleteRun`, `POST /authoring/v1/runs/{run_id}/complete`,
lifecycle kind `run.completed`, idempotent terminal replay, session stays
Active, adopted at `19d845c499`), and the ADR's dated D1 amendment rules
ADOPT-AND-EXTEND: this plan builds on the shipped `complete`/`run.completed`/
`CompleteRun` names throughout, never the earlier `settle`/`run.settled`
draft vocabulary. Because the success arm already shipped, the three P01
steps that would have built the transition, its authorization, and its event
emission from scratch are retired; the remaining D1 substance (the outcome
enum, `failure_reason`, owner-only authorization, and the `Failed` arm) is
consolidated into the one step that extends the existing route. Phase P01
lands that extension together with D2 (run-scoped cancel, explicit session
cancel, and the bounded FIFO queued-turn primitive) and the single authoring
schema-version migration, authored once and covering the queue state,
changeset provenance columns, and the feedback_batches table so later phases
add only code, not a second migration. Session cancel VOIDS the queue in the
same unit of work (no promotion into a cancelled session; voided turns
remain readable history, never runnable). P01 also carries the frontend
Stop-path cutover structurally, not as a prose coupling note: deleting the
fresh-session-bootstrap-on-Stop behavior lands in P01 itself, in the same
phase as the engine's run-scoped cancel, so the frontend and engine halves
of that behavior-visible change ship together by construction. Phase P02
serves interrupt state and a typed decision schema (D3). Phase P03 serves
proposal-run correlation and the scope-level mode read (D4+D5). Phase P04
introduces the immutable structured feedback batch (D7, the
agentic-feedback-loop ADR's engine half); its store shape is authored two
phases earlier in P01's single migration, so any shape change discovered
while building P04 ships as a fresh schema version, never an edit of the
version P01 already landed. Phase P04a builds the ONE bounded, timed
background janitor D1 assigns its new abandoned-run-reap duty to; the
janitor did not previously exist and drives the genuinely undriven expiry
seams (tool-permission expiry, interrupt reaping, lease expiry) plus
run-reap; generation-transcript compaction is NOT a janitor duty (it already
runs opportunistically inside every start_prompt_turn unit of work by
deliberate prior decision) and the janitor at most runs a stated backstop
sweep over the same bounded due-set, never a second owner of compaction.
Phase P05 cuts the frontend over onto every remaining served shape, deleting
the three remaining named interims (the client one-slot queue, the
client-staged interrupt annex, and session-actor-latest correlation) plus
the proposal-gated autonomy control, with no bridge left behind; it also
wires the dispatch loop's finish to call the already-shipped, D1-extended
complete route (without which no run ever completes and Done/Failed still
never renders even after the engine work lands) and adds the explicit
session-cancel command as new scope distinct from Stop. A janitor-reaped
run's `run.completed` needs no new adapter case in P05, only verification
that the existing case renders its `abandoned` failure reason honestly (the
SSE adapter step, S37, is scoped to only the two remaining lifecycle kinds,
`turn.queued` and `session.cancelled`, since the a2a lane's commit
`506daa04a2` already consumed `run.completed` with terminal-aware
invalidation).

**Territory note (2026-07-17):** the a2a session runs its own activation
plan (`.vault/plan/2026-07-17-a2a-orchestration-edge-plan.md`) in this same
worktree and commits to our shared main. Its P04 (S09-S12) is the same D7
structured-feedback-batch work as this plan's P04, and its S12 is the same
composer feedback_batch_id cutover as this plan's P05.S44; both are
mechanically annotated `[OWNED BY 2026-07-17-a2a-orchestration-edge-plan
...]` in place rather than removed, so the scope is visible but not
double-built. Do not execute P04 or P05.S44 from this plan unless the a2a
plan explicitly releases that scope back here.

D6 (served model options) is explicitly DEFERRED by the ADR and is NOT
planned here; its return trigger is the agent runtime (langgraph adapter or
the a2a edge's preset/agent-card surface) exposing a model-selection surface,
at which point `GET /v1/models` and the `model` field ship in a follow-on
plan and the Model pill's disabled-with-reason state is deleted in the same
cutover.

D5 also reconciles three unscheduled mode-plane advisories from the
authoring-backend epic; none add plan scope. Session narrowing-override
wiring stays DEFERRED (return trigger: the first product surface offering a
per-session autonomy choice). Mode-set re-narrowing on return is RECONCILED
as already-held behavior, now observable through D5's read; a future
active-run re-check on mid-run downgrade is a separate, not-yet-triggered
return. The direct-write capability admin seam stays DEFERRED, standalone
(return trigger: a second registered human principal or any remote
principal). The dedicated janitor phase (P04a) is described above.

## Steps

## Parallelization

P01 lands first and alone: it authors the single schema-version migration
that P03 (provenance columns) and P04 (feedback_batches table) both build on,
and it is the coupled D1+D2 change the ADR's sequencing note calls out as one
unit. P02 (D3), P03 (D4+D5), and P04a (the janitor) are independent
exposures once P01's migration has landed and may run in parallel against
separate coding agents; P04a touches the same run-lifecycle module P01
does, so route it to a coding agent only once P01 has landed
(sequential-after-P01, parallel-with P02/P03) to avoid two agents racing
the same run-completion code paths. P04 is OWNED BY the a2a plan's own P04
and is not dispatched to a coding agent from here at all (see the Territory
note in the Description); P05.S44 carries the same ownership annotation and
is skipped when P05 executes, leaving the rest of P05 unaffected. P05
depends on P01-P04a all being reviewed and merged, since its SSE adapter
cases and deletions consume the served shapes each earlier phase produces;
it does not parallelize against them. The fresh-session-bootstrap-on-Stop
deletion
(`P01.S38`) is no longer a cross-phase coupling risk to track in prose: it
was moved structurally into P01 itself, in the same phase as the engine's
run-scoped cancel, so the frontend and engine halves of that
behavior-visible change are mechanically incapable of shipping apart.
`just dev lint all` must exit 0 on every phase before that phase's review
step, independent of any other phase's state.

## Verification

The plan is complete when every Step in every Phase is closed (`- [x]`) and
each Phase's review step has been signed off by the team reviewer against
the ADR's Verification strategy scenarios for its closures:

- P01 (D1+D2): the already-shipped Active/CancelRequested to Completed
  transition extended with the outcome enum, `failure_reason`, and the
  `Failed` arm; terminal-replay idempotency; owner-only 403 on a non-owner
  complete; one `run.completed` SSE delivery per completion; session-preserving
  run cancel; dual-event session-cancel; the queue-cap typed 422; atomic FIFO
  promotion under crash-injection between complete and promote; and the
  `joined` status fully removed from the codebase.
- P02 (D3): the interrupt list is capped, raise-order with pending entries
  flagged, and truncation-marked; the typed decision round-trips the
  existing permission-decision write; a legacy opaque decision serves
  `decision_unreadable` without failing the page; a client that drops the
  `/execute` `awaiting_permission` response recovers the pending interrupt
  from the list.
- P03 (D4+D5): `ProposalProjection` serves `session_id`/`run_id`/`turn_id`
  for a tool-dispatched proposal and `None` for a human one; pre-migration
  records still deserialize; `GET /v1/mode` round-trips `POST /v1/mode` and
  serves the default record on a fresh store.
- P04 (D7) [OWNED BY a2a-orchestration-edge P04]: batch immutability holds
  under later comment edits; the comment-count cap and byte-bound are
  enforced; turn-reference fence violations are typed; the turn record
  carries the batch id. These scenarios are verified by the a2a plan's own
  P04 review, not this plan's; P04's review step (S36) is not routed to a
  coding agent from here.
- P04a (janitor): a stale active run is reaped to `Failed`/`abandoned` with
  exactly one `run.completed` emitted; a fresh active run is left untouched;
  each of the three genuinely undriven duties (tool-permission expiry,
  interrupt reaping, lease expiry) is observably driven by the sweep; the
  compaction backstop never double-compacts a session already compacted by
  its own per-turn path; the sweep stays within its bounded budget under a
  large backlog.
- P05: the dispatch-loop-finish call to the complete route actually completes
  a run end to end so Done/Failed renders from the wire; every live-wire
  frontend suite passes with the new SSE adapter cases exercised; the queue
  chip, staged-interrupt annex, and session-actor-latest correlation mark are
  verified absent from the codebase, not merely unused; the autonomy
  control renders correctly with an empty review queue.
- P01 additionally verifies the Stop-path live scenario (session stays
  Active, no fresh-session bootstrap) and session-cancel voiding the queue,
  both folded into P01's own test step per the same-phase coupling above.

`just dev lint all` (Rust fmt + clippy, plus eslint/prettier/tsc for P05)
exits 0 for every phase before that phase reports done, per the dev-workflow
rule. D6 is explicitly out of scope for this plan's completion criteria.
