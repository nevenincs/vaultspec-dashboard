---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S34'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# [OWNED BY 2026-07-17-a2a-orchestration-edge-plan P04 - do not execute from this plan unless that plan releases it] Write tests covering batch immutability under later comment edits, cap and byte-bound enforcement, typed turn-reference fence violations, and the turn record carrying the batch id

## Scope

- `engine/crates/vaultspec-api/src/authoring/feedback.rs`
- `engine/crates/vaultspec-api/src/authoring/session/tests.rs`
- (substance owned and delivered by `2026-07-17-a2a-orchestration-edge-plan` `P04`,
  now fully ticked and reviewed at that plan's `P05.S13`)

## Description

This step is explicitly OWNED by the edge plan's `P04`, not executed from this
plan. The edge plan's `P04` (S09-S12, S14) is fully ticked, and its cross-repo
review closure (`P05.S13`) has landed. Every named test scenario exists and is
live:

- Batch immutability under later comment edits:
  `create_is_digest_addressed_and_replays_identical_content` (digest-addressed —
  identical content replays the SAME record; different content mints a different
  id, never mutates the original) and `stored_batch_round_trips_and_has_no_update_path`
  (the store literally has no update path).
- Cap and byte-bound enforcement: `caps_and_byte_bound_are_enforced_at_creation`
  (comment cap, byte bound, and empty-batch refusal, each a typed error).
- Typed turn-reference fence violations:
  `a_turn_referencing_an_unknown_or_foreign_feedback_batch_is_refused` (unknown
  batch id → typed "unknown feedback batch" refusal; a foreign session consuming
  another session's batch → typed "belongs to another session" refusal).
- The turn record carrying the batch id: the same test's final assertion —
  the legitimate owner's turn snapshot carries `feedback_batch_id`.

## Outcome

Every named scenario is proven live and none required new authorship from this
plan — the edge plan's P04 substance already satisfies this step's ask in full.

## Notes

Landed at commit `d5bfbac932` ("feedback-batch engine slice... feedback.rs repo +
POST/GET /v1/feedback-batches + turn fence + CommandKind::CreateFeedbackBatch;
digest-addressed id, caps 32/256KiB"), per the campaign's coordination memory. This
record was authored during a fill pass, cross-citing the edge plan's ownership per
the team's committed ownership annotations and the persisted review verdict
(`62cf6b4573`) — no code changes by me.

Independently reverified: `cargo test -p vaultspec-api --lib -- authoring::feedback::tests`
— 3/3 passed; `cargo test -p vaultspec-api --lib -- authoring::session::tests::a_turn_referencing_an_unknown_or_foreign_feedback_batch_is_refused`
— 1/1 passed; full lib suite — 831/831 passed.
