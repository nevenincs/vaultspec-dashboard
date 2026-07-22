---
tags:
  - '#audit'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-21'
related: []
---

# `a2a-orchestration-edge` audit: `reconciliation`

## Scope

A read-only, feature-by-feature reconciliation of the `edge-activation` implementation branch against dashboard `main`, which independently ADOPTED the entire a2a-orchestration-edge surface via the concurrent `agent-wire-gaps` campaign (main commits `fd7069cb01` broker+relay, `d5bfbac932` feedback batches, run-completion in the wire-gaps P01 slice). The audit determines whether main preserves the ratified invariants, what each side has that the other lacks, and the disposition of the retired branch. No code was changed during the audit; the one ported artifact (below) was landed separately.

## Findings

### reconciliation | high | main supersedes edge-activation across all four features — do not merge the branch

Blind-merging the branch would double-implement every feature. Main preserves every ratified invariant and is EQUAL-OR-BETTER on most. Feature by feature:

- run.completed (S01): main has `LifecycleEventKind::RunCompleted` mapped to the wire string `run.completed` in `events.rs`, emitted in `session/commands.rs`, PLUS richer wire-gaps context (a run outcome enum, run-scoped cancel, a queued-turn primitive, delegator run-completion coverage). The branch's `RunStatus::Completed` slice is fully subsumed.
- Broker + D2 tokens (S03/S04): main's `routes/ops/a2a.rs` has the same FIXED five-verb whitelist, the 403-before-any-discovery-or-round-trip guard, D2 per-role mint-and-inject via `uow.actor_tokens().issue`, and never-logs the token-bearing payload. It also carries the `CommandKind::CreateFeedbackBatch` kind guard. BETTER than the branch: main omits `actor_tokens` from the request TYPE, so a client structurally CANNOT supply forged tokens — stronger than the branch's accept-then-overwrite. Main INLINED the broker (no separate `a2a-client` crate), which is a structural choice, not a gap.
- Relay (S07/S08): main's `routes/ops/a2a_stream.rs` is a DEDICATED per-run endpoint `/ops/a2a/runs/{run_id}/stream` with its own bounded replay ring (`RELAY_RING_CAP` 1024), live broadcast (256), monotonic seq, terminal latch on `thread_terminal`, `MAX_CONCURRENT_RELAYS` 64 (pruning FINISHED, unsubscribed runs — never evicting a live one), a `MAX_RELAY_FRAME_BYTES` 512 KiB safety net above the upstream 256 KiB `progress_dropped` sentinel (passed through UNALTERED), and `since=`/lag gap emission. It preserves every functional relay invariant but supersedes the branch's single-global-`a2a`-channel design (main's per-run isolation avoids interleaving with graph deltas; the frontend relay consumer targets this endpoint).
- Feedback batches (S09/S10): main's `feedback.rs` is digest-addressed (`blob_oid`, the id IS the content digest), insert-once with idempotent replay, served by `POST` and `GET /authoring/v1/feedback-batches[/{id}]`, on schema v21. BETTER: main EXCLUDES timestamps from the digest input, so identical content replays the SAME batch (the branch included `created_at_ms`, making identical content a NEW batch — inferior idempotency). Main also validates the session EXISTS at create time, stronger than the branch's consume-only check.

### reconciliation | medium | migration v21 collision — main's stands

Both the branch and main assigned schema migration version 21 to the feedback-batches table. Main's `add_queue_state_provenance_and_feedback_batches` (v21) is the one on `main`; the branch's `create_authoring_feedback_batches` (v21) is dead. No action beyond retiring the branch.

### reconciliation | medium | tier-key decision — `agent`, not `orchestration`

Main degrades a dedicated `agent` tier on an a2a outage (`degraded_tiers_for(&cell, "agent", ...)`), never `semantic`. The branch added an `orchestration` tier to the DEFAULT `tiers_block` vocabulary (always present). Evidence settles it: the frontend consumes an `agent` store (`frontend/src/stores/server/agent/`), so `agent` is the shipped, frontend-consistent key. The branch's `orchestration` key is DISCARDED. OPEN NOTE for the frontend consumer: main's `agent` tier appears present-only-when-DEGRADED (absent on healthy responses, since `query_tiers` does not probe a2a). If the Team-selector's disabled-with-reason logic needs the tier present-when-UP as well, that is a small main-side follow-on, not a branch port.

### reconciliation | low | only branch-superior artifact: an HTTP-level route test — PORTED

Main had store-level feedback tests (`feedback.rs`) plus the broker tests, but no Rust HTTP-level test exercising the create/read wire contract. The branch's route test (200 content-addressed, GET read-back verbatim, 404 unknown, wrong-kind refusal) was PORTED to main, adapted to main's shapes (`{status, batch_id, digest}` create receipt, `data.batch` GET record, session-existence precondition, 400 wrong-kind guard), and landed on `main` as a single-file addition to `authoring/http/tests/group3.rs`. This was the only branch artifact worth carrying forward.

### reconciliation | low | retired-branch record

The `edge-activation` branch (30 commits, worktree `Y:\code\vaultspec-dashboard-worktrees\s01-verify`) is RETIRED, not deleted (owner's call on deletion later). Its full engine-side surface (S01, S03, S04, S05, S07, S08 probe, S09, S10 plus the GET read route, the `CreateFeedbackBatch` kind, and the dual-auth contract) is delivered-superseded by main's adoption. Every contract it established (the D2 token bundle, the `feedback_batch_id` turn field, the create-envelope command string plus dual auth) was confirmed against main and shipped in the a2a S11 and frontend S12 work.

### reconciliation | low | feedback route receipt-vs-record shape is CANONICAL (ruling)

Live-probing main surfaced a create-vs-read shape asymmetry on the feedback routes: `POST /authoring/v1/feedback-batches` returns a RECEIPT with a flat `data.batch_id` (plus `digest`, `comment_count`, `total_bytes`, `status`), while `GET /authoring/v1/feedback-batches/{id}` returns the RECORD nested under `data.batch` with the struct's own field name `feedback_batch_id` (not `batch_id`). The team-lead RULED this CANONICAL, not a defect: it is a legitimate receipt-vs-record REST split (create returns a receipt, read returns the record under its own noun with its own field names), the read has exactly one consumer, and an alias or rename would be either API clutter or shipped-contract churn. `wire_gaps.rs` is NOT changed. Consequence for the a2a reader: its end state targets the nested `data.batch.{feedback_batch_id, items, ...}` shape EXACTLY, with NO `batch_id` fallback (interim tolerance to unblock proofs is deleted in the same session). The ported route test regression-locks the shape.

## Recommendations

- RETIRE `edge-activation` (do not merge); its plan checkboxes S01, S03, S04, S05, S07, S08, S09, S10 close as DELIVERED-SUPERSEDED-BY-MAIN.
- The S08 relay re-probe was RUN against a fresh a2a gateway (from a2a main HEAD, explicit non-default port) that DOES serve the S06 `GET /v1/runs/{run_id}/stream` verb. PROVEN live through main's engine binary: the engine forwards `POST /ops/a2a/run-start` to the S06 gateway and gets the v1 envelope with `run_id` and role assignments; the per-run relay endpoint `GET /ops/a2a/runs/{run_id}/stream` serves HTTP 200 `text/event-stream` (route present, subscribing to the upstream S06 stream — the earlier 404 blocker resolved); the `agent` tier degrades HONESTLY (`available:false`, "heartbeat stale") on lapsed discovery and is absent when healthy; and the relay forwards ZERO fabricated frames when the upstream is empty. STILL OWED — frame-CONTENT capture (frames-with-run_id, replay-from-since, gap-on-lag, sentinel over the wire): querying the gateway DIRECTLY produced no progress frames for a mock-autonomous run even with `worker_connected:true`, so a2a is not emitting `sse_frames` for that preset; a run/preset that actually streams progress is needed to capture live frame content. The frame-level behaviors are hermetically proven by main's `a2a_stream.rs` tests regardless.
- P05 ADR AMENDMENT SPEC (for the reviewer): the amendment must name the `agent` tier key (NOT `orchestration`); record the sibling-down-is-200-degraded ruling (a known-down sibling returns HTTP 200 with the degraded tier, 502/504 reserved for crash/timeout); and record the shipped surfaces — the `/ops/a2a/{verb}` five-verb pass-through, the per-run relay endpoint `/ops/a2a/runs/{run_id}/stream`, the feedback-batch create/read routes plus the `feedback_batch_id` turn field, and the run-completion `POST /authoring/v1/runs/{run_id}/complete` slice. Also scrutinize: the D4 source-revision fence (implemented as existence plus session-ownership; the revision fence is a documented partial), the feedback GET authz (principal-permissive capability-by-id read), and confirm the rag-dedup sweeps were run per the standing mandate. Note the feedback receipt-vs-record shape split as CANONICAL per the lead ruling (not a defect); the reviewer MAY still recommend a future normalization to the `wire_gaps.rs` owner.

## P05 review verdicts (appended 2026-07-17, session c4903de7 — closing the S13 review half)

Two formal reviews were run over the shipped edge, adjudicating the spec above.

### review | high | engine-side scopes: PASS / PASS

Scope A (agent-wire-gaps P02/P03: interrupt listing + typed decisions, provenance,
mode read — `169ecd4aa0`, `4063e2b150`, `145d699f96`, `9f67b2af07`, `463a9dea29`)
and Scope B (edge P02/P03/P04: `/ops/a2a` pass-through + D2 provisioning, per-run
relay, feedback batches — `fd7069cb01`, `a8a68f6a8f`, `d5bfbac932`) both PASS with
zero required code revisions. Independently verified: 822/822 lib tests, Rust
fmt/clippy clean, digest-exclusion on run/turn provenance (no stable-key
contamination), whitelist-403-before-discovery ordering, and token values absent
from all logging. Two MEDIUM record-the-interpretation advisories were closed the
same day as ADR amendments (`43fe7ffbe1`, `d7dfeef163`) satisfying the P05
amendment spec above in full: `agent` tier key, sibling-down-200-degraded ruling,
dedicated per-run relay endpoint reading of D3, complete shipped-surface list, and
the D7 turn-fence reading (existence + session ownership at turn start; the
`source_revision` fence binds at apply time through the base-revision fences).
The feedback GET was reviewed as a principal-permissive capability-by-id read,
consistent with every other authoring read.

### review | high | a2a-side conformance: 6/6 CONFORM

Cross-repo read-only review of `vaultspec-a2a` main: (1) gateway five verbs +
run-stream under `/v1`, 64KiB run-start cap matching the engine boundary, typed
refusals; (2) D2 token intake — bounded bundle, no mint/rename/share path,
in-memory-only `RunTokenStore` dropped at run end, repr-redacted, zero token
logging; (3) bounded versioned SSE frames with the `progress_dropped` sentinel the
engine relay forwards verbatim, live-tested; (4) write seam adversarially proven
(`test_acp_vault_deny.py` traversal/case/symlink denials as `forbidden_actor`
VALUES, plus an observed-negative filesystem-watcher proof) — the sole
document-creation path is the engine authoring client; (5) `feedback_batch_id`
threads opaquely to worker dispatch with content retrieved only via
`AuthoringClient.get_feedback_batch`, degrading to no-grounding on fault;
(6) discovery contract (atomic service.json, 15s heartbeat, 120s staleness
matching the engine constant, ungated dependency-probed `/health` with live pid).

### review | medium | open items carried to closeout

- The worker-side caller of `POST /authoring/v1/runs/{run_id}/complete` is NOT yet
  landed in the a2a worktree (grep-confirmed absent); it is the parallel lead
  session's in-flight lane. Until it lands, only client-driven runs complete;
  a2a-driven runs rely on the janitor's abandoned-run reap (also that session's
  claimed P04a lane). S13 holds open for this and for P04.S14's live proof.
- The S08 frame-level relay re-probe against a fresh S06-serving gateway (port
  8811) is COMPLETE. Through main's per-run endpoint `GET
  /ops/a2a/runs/{run_id}/stream` a real SSE frame was captured over the wire
  (`event: thread_terminal`, `id: 0`, `replay:true`, `seq:0`), replay-from-ring
  and terminal-latch on reconnect were exercised (`Last-Event-ID: 0` still
  re-delivers the terminal event), the `agent` tier was absent under a fresh
  heartbeat, and zero frames were fabricated. The intermediate progress-frame
  path (gap-on-lag, gap-on-eviction, `progress_dropped` sentinel over the wire)
  could not be driven live: mock-autonomous runs resolve `provider_ready:false`
  at execution and fail at `last_sequence:0` emitting no `sse_frames` — an
  a2a-side emission gap (executor-service's domain), not a relay defect. Those
  behaviors stay proven by main's hermetic `a2a_stream.rs` tests (17 passed, 0
  failed on the main binary), which deterministically overflow the ring in a way
  a live run cannot reliably reproduce. Recorded in the P03.S08 Step Record.
- a2a-side finding (cross-verified, for a P05 note): the reason no intermediate
  frames are drivable on mock presets is a discovery-vs-execution provider
  readiness gap in a2a. executor-service reproduced it against a full local mock
  stack (vidaimock docker + gateway + auto-worker, `worker_connected:true`):
  `probe_provider_readiness` hard-returns ready for MOCK/DETERMINISTIC providers
  at DISCOVERY, yet single/multi/pipeline mock runs all terminate at
  `last_sequence:0` producing zero `sse_frames` at EXECUTION. So mock presets
  emit no progress frames regardless of when a subscriber attaches, and a
  compose-stack capture would hit the same wall unless the mock provider is made
  to actually stream at execution. Two findings for the a2a backlog: (1) mock
  presets emit no progress frames; (2) provider readiness diverges between
  discovery and execution for mock/deterministic providers.
- FINDING (D3 progress-frame emission unverified) — HEADLINE: whether D3 carries
  progress frames from a genuinely executing run is UNVERIFIED — the seam is
  coded (`ingest.py` `astream_events` → `emit_*`) but end-to-end coverage is
  injection-based (`test_aggregator` direct calls, `test_gateway_live`
  `relay_payload` injection), no test drives `handle_dispatch` → `astream_events`
  → `emit_*` → wire, and every drivable run shows `last_sequence:0` with
  `roles:[]`. Seam precision (executor-service's read-only root-cause pass): the
  gap is NOT at streaming-consumption or aggregation — the consumption seam IS
  wired (`graph.astream_events(version='v2')` →
  `emit_agent_status`/`emit_message_chunk`/`emit_tool_call` → aggregator) and the
  aggregator does not drop. It is upstream of both: a mock run's graph never
  EXECUTES its nodes (hence `roles:[]` / `last_sequence:0`), so `astream_events`
  yields nothing and the emitters are never reached. The a2a backlog item is
  therefore: graph nodes don't execute for mock runs → emitters unreached, plus
  the missing driven-not-injected `handle_dispatch` → `astream_events` →
  `emit_*` → wire test.
- NAMED FOLLOW-ON (spawns a successor step/plan; does NOT reopen this plan):
  prove (or repair) end-to-end progress-frame emission from an executing run
  through worker → gateway → S06 → relay, with a driven-not-injected test.
  Vehicle: the deterministic `research_adr` capability (needs actor tokens plus a
  reachable authoring engine) or a real-provider lane (Z.ai near-term; Claude
  gated ~Jul-20).
- Rag-dedup sweep evidence (closeout — resolves the reviewers' carried item).
  Each Step Record carries its own dedup verdict; the pointer list below shows
  every step grounded against an existing analogue and reused or extended it
  rather than forking a parallel implementation. Explicit `vaultspec-rag` sweeps:
  `P03.S06` (found no prior stream verb — reuses the run/thread mapping
  run-status already uses), `P04.S11` (`--type code only:prod` — found no prior
  feedback/comment/revision path; `feature_tag` is the sole opaque-carrier
  analogue, mirrored exactly), `P04.S12` (grepped every comment-batch consumer —
  confirmed no existing feedback-batch client method or chip helper to reuse),
  and `P04.S14` (`--type code only:prod` — surfaced the mount-node grounding
  pattern as the closest analogue). Reuse-of-existing grounding (no new parallel
  home): `P02.S03` (mirrors the shipped rag ops module's whitelisted-dispatch /
  bounded-validation / discovery-predicate shape), `P02.S04` (token minting added
  inside the existing `ops_a2a` run-start dispatch, no parallel provisioning
  module), `P02.S05` (mirrors the shipped rag ops guard suite shape and its
  live-loopback harness), `P03.S07` (matches the existing engine SSE channels'
  shape; per-run relay chosen over a new multiplexed channel), `P03.S08`
  (verification of S07's relay — shares its grounding, no new production code),
  `P04.S09` (reused agent-wire-gaps' additive `authoring_feedback_batches` table
  — explicitly no second migration authored), and `P04.S10` (reused the apply
  path's existing base-revision fence machinery for the turn field). The strongest
  anti-duplication act was the reconciliation itself: this audit found the
  `edge-activation` branch's parallel implementation of the entire edge surface
  and retired it in favor of main's single adopted home.

## Lane takeover (2026-07-17, owner-ordered)

The a2a-side caller of `POST /authoring/v1/runs/{run_id}/complete` (the S13 hold's
last open item, previously the parallel lead session's claimed lane) is verified
NOT landed on a2a main and is hereby taken over by the edge-activation team on the
owner's instruction. Executor-service drives it to completion in the a2a
repository; S13 closes on its landing plus live proof.

### lane-takeover | high | run-complete caller is NOT APPLICABLE — a2a-driven work creates no engine run

Grounding (executor-service, code + live probe) shows the run-complete caller has
nothing to call: a2a-driven authoring work creates ZERO engine run records.
Evidence chain:

- The a2a worker's sole authoring driver is `authoring/submitter.py`; its only
  engine verbs are `create_session`, `create_proposal`, `submit_for_review`, and
  `recovery_snapshot` (a read). It never starts a prompt turn.
- `start_prompt_turn` — the ONLY command that builds a `RunRecord{status: Active}`
  (engine `authoring/session/mod.rs`) — has ZERO non-test callers anywhere in a2a.
  `AuthoringSession.start_turn` exists but nothing in the worker/graph/submitter
  invokes it; no a2a path uses `execute_agent_tool` / `resume_run` / any `/runs/`
  verb; proposals carry only OPTIONAL run provenance and the a2a `create_proposal`
  payload sends no `run_id`.
- LIVE PROBE against dashboard main's engine binary, running a2a's exact sequence:
  after `create_session` → `active_run: None`, `runs: []`, `latest_run_id: None`;
  after `create_proposal` (status `draft`) → `active_run: None`, `runs: []` STILL.

Disposition: the run-complete caller is closed as NOT APPLICABLE; nothing
implemented. The reviewer's "a2a-driven runs strand active engine runs" does not
hold — a2a strands no runs because it creates none.

### lane-takeover | medium | ENGINE ASK — a benign session-terminal verb (a2a strands SESSIONS, not runs)

The real stranding is SESSIONS: `create_session` sets `SessionStatus::Active` and
the a2a worker never closes the session on submit-success (no session-terminal
call on the success path). Closing it needs a BENIGN session-terminal verb — but
the engine exposes none. `SessionStatus::Closed` IS defined (as_str `"closed"`,
maps to `LifecycleStatus::Expired` in `session/validate.rs`) but has NO writer:
no `CommandKind` (session commands are only `CreateSession` / `CancelSession`), no
route (only `/v1/sessions/{id}/cancel` is mounted), no function sets `Closed`. The
only session-terminal path is `cancel_session` → `Cancelled`, which is wrong
semantics for success (cancellation, not completion).

Named cross-repo ASK (engine-side, wire-gaps owner's surface, same register as the
other filed asks): add a benign session-close command + route (e.g.
`complete_session` / `close_session`) that transitions the already-defined
`SessionStatus::Closed`, callable by the a2a worker at submit-success settle
(best-effort, typed-failure, never on cancel/fail). When it lands, the a2a caller
is a small follow-on. Until then, a2a-left-Active sessions rely on the engine's
session retention for reaping.

### lane-takeover | RESOLVED (engine half) | benign `close_session` verb landed — `SessionStatus::Closed` is now reachable

The ENGINE ASK above is RESOLVED on the engine side by `a91f38cab2` (dashboard
main). `SessionStatus::Closed` now has a writer:

- `CommandKind::CloseSession` + the `close_session` session command transition
  `Active` → `Closed`, stamping `closed_at_ms` (JSON-only on the record like the
  run `failure_reason` precedent — no column, no migration; the `authoring_sessions`
  status CHECK already admitted `'closed'`).
- Route `POST /authoring/v1/sessions/{session_id}/close`, kind-guarded (a mismatched
  command is a `400 REQUEST_INVALID_KIND`), dual-auth through the `ResolvedCommand`
  principal seam like the sibling session commands.
- `LifecycleEventKind::SessionClosed` → `session.closed` on the durable outbox,
  keyed `:session-closed` so it rides the deduped feed and replay.
- Benign semantics (distinct from `cancel`): a close never tears down work — a
  session with a genuinely active run is REFUSED (typed `StoreError::Session`, 422)
  rather than force-cancelled; re-closing and closing an already-`Cancelled` session
  are idempotent no-ops that publish no duplicate transition (mirrors
  `cancel_session`'s non-`Active` re-entry). `vaultspec-api --lib` 830 passed / 0
  failed, clippy + fmt clean.
- Accuracy note: the run-active refusal is structurally moot for a2a-driven sessions
  — they never carry engine runs (the run-complete lane-takeover finding above), so
  the guard protects the dashboard's own CLIENT-driven sessions, not the a2a path.
- Closing half: the a2a worker's submit-success caller of this route lands next
  (executor-service holds the published envelope contract). Until that ships,
  a2a-left-`Active` sessions still rely on session retention for reaping.

### lane-takeover | RESOLVED (a2a half) | submit-success close-session caller landed

The a2a half is LANDED on a2a main (executor-service, 4 files): the worker now
closes its engine authoring session on a run's terminal SUCCESS, so a2a-left-
`Active` sessions no longer depend solely on retention for reaping.

- `authoring.close_authoring_session(client, session_id)` wraps the enveloped
  `close_session` command against `POST /v1/sessions/{id}/close`, dual-auth,
  idempotent per the route.
- `executor._close_authoring_session_best_effort` reads `authoring_session_id`
  from the run's checkpoint state (`graph.aget_state`) and closes it, hooked in
  BOTH the `_handle_ingest` AND `_handle_resume` finally blocks — the resume path
  covers a gated `research_adr` run, which completes on its FINAL gate resume, not
  the initial ingest. Placement: AFTER `emit_terminal_status` (the run's own
  lifecycle truth lands first) and BEFORE `_mark_ingest_done` drops the session
  owner's token (the close needs it). Success-only is STRUCTURAL, guarded on
  `outcome == COMPLETED`; cancel and fail outcomes emit their own terminal and
  never reach the close arm. Best-effort: any fault degrades to a log — a
  completion-time housekeeping call never fails an already-succeeded run.
- CORRECT no-op for non-authoring runs: a mock/coder run creates no engine
  authoring session, so `authoring_session_id` is absent and the close correctly
  no-ops. This is intended behaviour, not a gap.
- Live-proven (dashboard main engine binary): `create_session` → close → the
  session reads back `"closed"`; idempotent re-close (200, still closed); and a
  benign no-op on an already-`Cancelled` session (stays cancelled, no overwrite).
  ruff + ty clean; 63 executor/authoring unit tests green.
- Integration proof OWED to the shared driven-run vehicle: the end-to-end
  run-settle proof (a real run settling → the hook fires → `session.closed` on the
  feed) needs a `research_adr` run with a WORKING provider, which cannot execute on
  the mock lane (the same provider-readiness-at-execution wall from S08). It rides
  the SAME named follow-on vehicle as the frame-content proof —
  deterministic-`research_adr` or a real-provider lane — recorded above. The
  caller's core (the close verb wire + the exact seam placement) is proven and
  code-complete now.

### closure | high | P05.S13 closes — every hold dispositioned (appended 2026-07-17, session c4903de7)

All three carried open items are resolved: the a2a-side run-complete caller is
NOT APPLICABLE per the lane-takeover grounding above (a2a-driven authoring work
creates zero engine run records — code chain + live probe); the S08 relay
re-probe is recorded with frames+replay proven over the per-run endpoint
(`72b0742959`), with the remaining frame-content proof pinned to graph execution
as a named follow-on; the rag-dedup sweep pointers are compiled (`9c3cff381a`).
Together with the engine review (PASS/PASS), the a2a-side conformance review
(6/6), and the D1–D3 + D7 ADR amendments, the cross-repo review-and-ratification
scope of P05.S13 is complete. Abandoned-run reaping for client-created runs
remains the agent-wire-gaps P04a janitor's duty (claimed by the parallel lead),
outside this plan's scope by the committed ownership annotations.

### review | high | wire-gaps P05.S48 — frontend cutover review, two rounds (appended 2026-07-17, session c4903de7)

**Round 1: PASS with one HIGH.** `resume_interrupt` had no authorization floor —
any standing registered actor could resolve ANY run's pending interrupt, whether
approving a stranger's pending tool-permission grant or injecting a steering
prompt into a run they neither owned nor had a delegation relationship to. The
route's write-side counterpart, `complete_run`, already enforced a
run-owner-or-delegator floor; `resume_interrupt` acted on the same run-scoped
authority (granting permission, steering an agent mid-run) without the matching
check.

**Test-integrity finding, carried for the closing audit.** The bug was hidden
behind a test that had normalized it: `Composer.render.test.tsx`'s original S41
steer test carried a header comment asserting "resume is a capability-by-id, not
owner-fenced" as a documented DESIGN choice, when it was in fact the undetected
gap. The test never modeled two DIFFERENT principals where one lacked ownership —
it exercised the SAME ambient principal throughout, so the missing floor could
never surface as a failure. The lesson: a test that only ever drives the
happy-path identity can bake in and normalize the exact defect a later review
catches: model the ADVERSARIAL principal, not just the authorized one, whenever a
route claims an ownership or delegation floor.

**Fix, verified PASS-FINAL (`ff3863dbec`).** Added the run-owner-or-delegator
floor inside the SAME unit-of-work as the interrupt resolve — atomic with the
write it protects, matching `complete_run`'s existing pattern. Proven two ways: a
new engine test (`interrupt_resume_refuses_a_standing_stranger`) shows the
stranger fence firing as a 403 naming "owner" in the refusal AND the interrupt
staying `pending` on the served list afterward (not merely an error code — the
state is provably untouched); two pre-existing tests
(`interrupt_resume_route_resolves_by_id_and_replays`,
`run_interrupt_listing_recovers_pending_and_serves_typed_decisions`) were
re-seeded with real owned runs so the legitimate owner path is honestly exercised,
not accidentally bypassed via a bare literal run id. The frontend steer test was
rewritten to model product ownership correctly: an ambient human owns the session
and run, a separate agent principal parks the interrupt, and the SAME owning human
steers — which the fixed route now correctly authorizes. A stale LOW in
`ProposalCard.live.test.tsx`'s header comment (still describing the pre-`S42`
actor-identity correlation heuristic) was also corrected to describe the actual
exact-`run_id`-bind behavior. Independent re-check: 831/831 engine lib tests,
`cargo fmt --check` clean, `cargo clippy --all-targets` zero warnings, and the
frontend Composer/ProposalCard suites green — the full gate is clean at this
commit.

**Round 2: PASS-FINAL.** Plan tick at `044382d7d3`.

## request_changes third-verdict review (appended 2026-07-17)

Scope: the `request_changes` (third review verdict) activation — engine served
eligibility + ReviewStation UI — committed as `5a620099b6`, nit-fixes `c0b7fdd3c3`.
Reviewed against the D3 three-verdict amendment. **Verdict: APPROVE-WITH-NITS** (both
nits fixed in `c0b7fdd3c3`).

### review | high | all six invariants HOLD — served eligibility cannot drift from the decision predicate

- **Served == accepted, enforced not advertised.** Both `approvals.rs::review_decision_eligibility`
  (RequestChanges arm) and `projections/mod.rs::eligibility_for` (NeedsReview arm) call the
  identical `transitions::edit_proposal_transition_eligibility`, which attaches NO
  validation/review-decision freshness — so request_changes is legal on a stale/unvalidated
  review, matching prior decision behavior. `submit_decision` returns early without persisting
  when `!eligibility.allowed`, so the served predicate is enforced.
- **Self-approval ban correctly N/A** to request_changes (`automated_self_approval_blocker`
  invoked only in the Approve arm) — feedback, not an approval.
- **Freshness/409 + append-only records UNCHANGED** — the diff touches only the RequestChanges
  branch body; approve/reject freshness, idempotent-replay, the different-reviewer 409, and
  `append_revision` are untouched.
- **Required-comment gating HOLDS** — submit disabled until the trimmed note is non-empty; the
  trimmed comment is carried with wire `decision:"edit"` through the same decisions seam.
- **Third action served-only** — rendered from `proposal.eligibility` (`edit_proposal`), never
  client-invented; `edit_proposal` added to the approval-identity guard; a "no served
  edit_proposal → no button" test proves it.
- **Architecture / store-selector / design-system rules clean** — no fresh-ref selector, no
  hardcoded px/hex, displayed state backend-served.
- **Adversarial probe (Approved-changeset drift):** the helper permits `Approved → Draft`, but
  the projection advertises `edit_proposal` only for NeedsReview. Not drift: an Approved
  changeset's approval already carries a decision, so `submit_decision` short-circuits to
  idempotent-replay / different-reviewer 409 before re-evaluating eligibility. The Approved arc
  is unreachable via the decisions route, so served (NeedsReview-only) matches accepted.
- **Tests non-tautological** — projection test asserts approve/reject served-denied (missing
  validation) + edit_proposal served-allowed; render test asserts the required-comment gate, the
  trimmed carry, and zero approve/reject firings.

### review | low | RESOLVED — dead `commentRequired` localized message

`REQUEST_CHANGES_DIALOG.commentRequired` + its catalog key + locale strings were declared but
never rendered (the disabled button was the only signal). FIXED in `c0b7fdd3c3`: rendered as a
visible required-note hint under the comment field (`aria-describedby` + `aria-invalid`).

### review | low | RESOLVED — duplicated EditProposal kind→target mapping

The `Authoring|Direct → Draft` / `Rollback → RollbackProposed` table was duplicated across the
eligibility helper's inline match, `command_allows_transition`, and `approvals.rs::edit_proposal_target`
(agreeing today, silent-desync risk on a future edit). FIXED in `c0b7fdd3c3`: promoted a single
`transitions::edit_proposal_target(kind)` that all three consult.

### review | high | live-proved end-to-end

Against a freshly-built engine, the a2a `test_verdict_subscriber_live.py` `service` tests pass:
a human `request_changes` on the live decisions route → engine `approval.resolved(decision=request_changes)`
→ the verdict subscriber resumes the parked run with `verdict=request_changes` to a real worker
(thread → RUNNING = the writer re-enters its revision loop). No mocks.

**Gate at `c0b7fdd3c3`:** engine 588 authoring tests + `cargo fmt --check` + clippy zero-warnings;
frontend tsc + review-station vocabulary/outcome/render + catalog/action-vocabulary green. (Tree
carries a PRE-EXISTING red from a parallel Composer team-run lane — `common:agent.composer.teamRunRefused`
/ `teamRunDismiss` — unrelated to this feature.)

### review | high | RESOLVED — request_changes submit 400'd end-to-end (envelope command), caught only by LIVE-DRIVING

The static review (APPROVE-WITH-NITS) and every unit/render test PASSED while the feature was in fact
BROKEN in the assembled app: the reviewer "Request changes" submit returned `400 unknown variant "edit"`.
`AuthoringClient.reviewDecision` reused `payload.decision` as the envelope `command` (a wire `CommandKind`).
`approve`/`reject` are valid CommandKinds so they worked, but the request-changes verdict rides the body as
`decision:"edit"` while its command is `edit_proposal` — so the envelope failed to deserialize before
reaching the handler. The render test mocked the action seam and the a2a live test hand-mapped
`edit→edit_proposal`, so both hid the gap. FIXED in `1496f78a17` (map `edit → edit_proposal` in
`reviewDecision`) + a live-wire regression (`authoring.happyPath.live.test.ts`: propose → submit →
request_changes asserts 200 + return-to-draft, which exercises the envelope a seam-mock cannot).

**LESSON (codify-worthy):** a review that only reads code + runs seam-mocked tests can pass a feature that is
fully broken at the wire envelope. UX features must be DRIVEN in the assembled app before "success" is claimed.

### review | high | UX conformance (Fable arbiter): PARTIALLY-CONFORMANT — request-changes de-modalized (DONE), two structural residues DEFERRED

A dedicated Fable agent judged the review surface against Codex / Antigravity / Claude
Code / Cursor / Windsurf / Zed / Copilot. Verdict: PARTIALLY-CONFORMANT. The inline
per-turn transcript card (one shared `ProposalCard`, exact `run_id` bind) IS the
industry happy path and best-in-class (one component ⇒ transcript and queue mounts can
never disagree); the standalone queue is legitimately KEPT (it uniquely covers non-agent
changesets with no `run_id`, proposals scrolled past the transcript window, and the
cross-run applied-under-policy lane — every industry tool has a cross-run inbox). Three
non-conformant residues:

- **RESOLVED (`f583d993d4`) — request-changes was a MODAL.** But `request_changes` is a
  message to the agent (returns to draft; the a2a phase gate resumes the writer against
  the note), so a route-blocking modal over the composer is a grammar clash. Replaced
  `RequestChangesDialog` with an inline in-card `RequestChangesComposer` (same required-
  note contract; one component, identical in both mounts). Live-verified.
- **DEFERRED (owner decision) — the standalone Review Station is a MODAL host.** Industry
  cross-run inboxes are never modal; a modal blocks the document AND the transcript that
  produced the proposal. Fix: de-modalize `ReviewStationSection` into a non-modal docked/
  routed panel (low cost — only `ControlPanels.tsx` host changes; the section is self-
  contained). Not done unilaterally — it is a shared control-panel-host change.
- **DEFERRED (blocked) — `AutonomyControl` is stranded** inside that modal and renders
  only once a proposal exists. It belongs composer-adjacent (Codex/Cursor/Claude-Code
  position), but that is BLOCKED by the known wire gap (no scope-level operation-mode
  read; mode is observable only through a proposal's policy). The filed wire ask is the
  real precondition.

### review | high | LIVE-VERIFIED in the running dashboard (post-fix)

Drove the assembled SPA (`:8770`) against the live engine (`:8767`, serving `['approve','reject','edit_proposal']`
for all 17 `needs_review` proposals): the footer "Review" chip opens the Review panel; 17 "Request changes"
buttons render from served eligibility; the dialog's submit stays disabled with the required-note hint until a
comment is typed (then enables + hides the hint); submit → `200` → "Request accepted" → the proposal flips to
**Draft** and offers "Submit for review" (the reviewer-edit arc). Screenshot evidence captured.
