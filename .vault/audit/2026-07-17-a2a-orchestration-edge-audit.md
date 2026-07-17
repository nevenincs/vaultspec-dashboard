---
tags:
  - '#audit'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
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
- The rag-dedup sweep confirmation named in the spec was not evidenced within
  either review's scope; carried as a closeout check item.
