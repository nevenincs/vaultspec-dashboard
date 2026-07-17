---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S10'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Add the typed feedback_batch_id field to StartPromptTurnRequest and verify ownership, revision fences, limits, and idempotency when a turn consumes a batch

## Scope

- `engine/crates/vaultspec-api/src/authoring/api/mod.rs`
- `engine/crates/vaultspec-api/src/authoring/session/commands.rs`
- `engine/crates/vaultspec-api/src/authoring/session/types.rs`

## Description

- Added `feedback_batch_id: Option<String>` to `StartPromptTurnRequest`
  (`#[serde(default, skip_serializing_if = "Option::is_none")]`), opaque to the a2a
  edge — only the id rides the turn-contract wire, never the batch content.
- Added the D7 consumption fence in `session/commands.rs::start_prompt_turn`: when a
  turn references a batch, the fence reads it via `uow.feedback_batches().get(...)`
  and rejects the turn with a validation error if the batch is unknown OR its
  `session_id` does not match the turn's own session — both checked before
  `uow.sessions().start_prompt_turn(...)` is called, so an invalid reference never
  reaches turn creation.
- Added `feedback_batch_id: Option<String>` to `PromptTurnRecord`
  (`session/types.rs`), so a consumed batch's reference is persisted on the turn as an
  audit trail; absent on ordinary turns and on every pre-migration record
  (`#[serde(default)]`).
- Limits and idempotency are enforced by `S09`'s own creation path
  (`FEEDBACK_BATCH_COMMENT_CAP`, `FEEDBACK_BATCH_MAX_BYTES`, digest-addressed
  replay) — this step's fence is existence + ownership at consumption time, not a
  re-check of creation-time invariants (a stored batch is immutable, so those
  invariants cannot regress between creation and consumption).

## Outcome

A prompt turn that references a feedback batch is verified to be consuming a real
batch that belongs to its own session before the turn is accepted; the reference
persists on the turn record for audit.

## Notes

Landed together with S09 in one reviewed commit (`d5bfbac932`). Two gaps worth
recording honestly rather than smoothing over:

1. **The "revision fences" clause in this step's own text is DEFERRED, not enforced
   here.** The fence code comment states it directly: "the batch's `source_revision`
   is provenance; the apply path's base-revision fences bind it later — the turn
   fence is existence + ownership." So `start_prompt_turn` never compares the batch's
   `source_revision` against the document's current revision at turn-start; that
   comparison is left to the apply path's existing base-revision fence machinery.
   Per the team lead's framing, this deferral awaits the current engine review's
   adjudication — it is a design choice already made in the landed code, not an
   open question I am resolving, but the plan step's literal "revision fences" wording
   is only partially satisfied by what shipped. Flagging for the reviewer rather than
   asserting it as fully closed.
2. **No dedicated behavioral test proves the consumption fence's reject paths.** The
   only test touching `feedback_batch_id` at the session layer
   (`session/tests.rs::turn_request`) is a fixture default (`None`) needed to keep
   existing tests compiling; nothing exercises a turn referencing an unknown batch id
   or a batch owned by a different session to confirm the fence actually rejects them.
   The frontend contract for this field was adopted verbatim from the parallel
   session's wireTypes per the team lead's note.

Independently reran the full `vaultspec-api` lib suite — 823/823 passed (green
because the fence's reject paths are simply untested, not because they were proven).
This record was authored during a fill pass (bookkeeping only, no code changes by
me); the plan tick already landed at `f7bdf28278`.
