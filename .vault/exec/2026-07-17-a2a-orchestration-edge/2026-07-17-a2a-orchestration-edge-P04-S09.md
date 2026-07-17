---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S09'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# [SCHEMA NOTE from agent-wire-gaps lead: the feedback_batches table itself lands via agent-wire-gaps P01.S01 as part of ONE additive schema-version bump (queue state + provenance cols + batch table) — build the snapshot backend ON that table and do NOT author a second migration for it. Any shape change ships as a FRESH version bump.] Build the immutable feedback-batch snapshot backend per feedback-loop D3 with stable identifier, digest, ordered comment bodies, anchors, author identity, source revision, session identity, and creation time, plus its creation route

## Scope

- `engine/crates/vaultspec-api/src/authoring/feedback.rs`
- `engine/crates/vaultspec-api/src/authoring/http/wire_gaps.rs`
- `engine/crates/vaultspec-api/src/authoring/http/mod.rs`
- `engine/crates/vaultspec-api/src/authoring/api/mod.rs`

## Description

- Added `feedback.rs`: `FeedbackBatchRecord` (schema_version, feedback_batch_id,
  digest, session_id, source_document, source_revision, author, ordered `items`
  (comment_id/body/anchor), optional instruction, total_bytes, created_at_ms) and its
  repository over the `authoring_feedback_batches` table added by
  `agent-wire-gaps P01.S01`'s additive schema-version bump — no second migration
  authored, per the schema note.
- Structural immutability: the batch id IS its content digest
  (`feedback-batch:<blob-oid>`), computed over a canonical `BatchDigestInput`
  (schema_version, session_id, source_document, source_revision, author, items,
  instruction — timestamps excluded so a retry replays instead of minting a sibling);
  the row is `INSERT ... ON CONFLICT(feedback_batch_id) DO NOTHING`, and the module
  defines no update path at all.
- Enforced at creation: non-empty items, `FEEDBACK_BATCH_COMMENT_CAP` (32, matching
  the shipped composer's batch cap), and `FEEDBACK_BATCH_MAX_BYTES` (256 KiB) over the
  serialized digest input (resource-bounds rule: every accumulator bounded at
  creation).
- Added the `POST /v1/feedback-batches` creation route (`wire_gaps.rs`, wired into
  `http/mod.rs`) requiring the `create_feedback_batch` command kind, resolving the
  session's existence, and serving `{status: recorded|replayed, batch_id, digest,
  comment_count, total_bytes}`.
- Added the companion `GET /v1/feedback-batches/{feedback_batch_id}` read route
  (principal-permissive, like every authoring read), serving the frozen record
  verbatim or an honest 404 for an unknown id.
- Added `CreateFeedbackBatchRequest` to `api/mod.rs`'s wire types.

## Outcome

A reviewer's chosen section-anchored comments freeze into one immutable,
digest-addressed engine record a prompt turn can reference by opaque id — comment
feedback now rides the turn contract as auditable data, not serialized prose, and the
a2a edge transports only the id.

## Notes

Landed together with S10 in one reviewed commit (`d5bfbac932`, "immutable
digest-addressed feedback batches — create/read routes + turn-contract consumption
fence"). Independently reran the three `feedback.rs` unit tests
(`create_is_digest_addressed_and_replays_identical_content`,
`caps_and_byte_bound_are_enforced_at_creation`,
`stored_batch_round_trips_and_has_no_update_path`) and the route-level
`feedback_batch_create_and_read_round_trips_through_the_routes` test (create/replay/
GET/404/kind-guard) — 4/4 passed — plus the full `vaultspec-api` lib suite — 823/823
passed. This record was authored during a fill pass (bookkeeping only, no code changes
by me); the plan tick already landed at `f7bdf28278`.
