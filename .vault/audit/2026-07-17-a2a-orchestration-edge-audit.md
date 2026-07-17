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

## Recommendations

- RETIRE `edge-activation` (do not merge); its plan checkboxes S01, S03, S04, S05, S07, S08, S09, S10 close as DELIVERED-SUPERSEDED-BY-MAIN.
- The S08 frame-level relay re-probe is OWED against MAIN's per-run endpoint `/ops/a2a/runs/{run_id}/stream` once an a2a gateway that actually serves the S06 `GET /v1/runs/{run_id}/stream` verb is resident (the gateway resident during the branch probe predates S06 and 404s the stream verb).
- P05 ADR AMENDMENT SPEC (for the reviewer): the amendment must name the `agent` tier key (NOT `orchestration`); record the sibling-down-is-200-degraded ruling (a known-down sibling returns HTTP 200 with the degraded tier, 502/504 reserved for crash/timeout); and record the shipped surfaces — the `/ops/a2a/{verb}` five-verb pass-through, the per-run relay endpoint `/ops/a2a/runs/{run_id}/stream`, the feedback-batch create/read routes plus the `feedback_batch_id` turn field, and the run-completion `POST /authoring/v1/runs/{run_id}/complete` slice. Also scrutinize: the D4 source-revision fence (implemented as existence plus session-ownership; the revision fence is a documented partial), the feedback GET authz (principal-permissive capability-by-id read), and confirm the rag-dedup sweeps were run per the standing mandate.
