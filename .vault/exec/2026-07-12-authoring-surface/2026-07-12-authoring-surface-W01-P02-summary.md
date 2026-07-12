---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# `authoring-surface` `W01.P02` summary

All four steps complete (S05-S08), adversarially reviewed: withheld on one HIGH plus three lesser findings, all resolved in-phase, then APPROVED on re-check.

- Modified: `engine/crates/vaultspec-api/src/authoring/store/mod.rs`
- Created: `engine/crates/vaultspec-api/src/authoring/comments.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/mod.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/model.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/transitions.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/events.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/api.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http.rs`

## Description

The section-anchored comments plane (ADR decision D2) landed end to end in the authoring backend. A bounded `authoring_comments` table (schema version 20, a fresh additive migration) and a typed repository store durable, non-re-derivable comment entities in the authoring-state store - the only sanctioned home for state the corpus cannot re-derive. Every accumulator is bounded at creation: a 16 KiB body cap, a 500-comment per-document cap, a 50000-comment per-store cap, and a 180-day resolved-comment retention window pruned opportunistically on create. Like the advisory-lease table, comments opt out of the formal retention/compaction lifecycle because an annotation is not rollback, review, or audit material.

Each comment anchors to a heading section through the SAME section selector a section edit uses (heading path, advisory range hint, expected content hash), so it inherits that selector's honest drift signal. Resolution is exact-or-conflict on read: an exact match serves the comment as anchored; a missing heading, an ambiguous heading, or a content-hash mismatch serves it as orphaned with typed evidence - still listed, never dropped, never silently re-anchored. Re-anchoring to the current section is an explicit mutation.

The comment surface is served over four routes (bounded list, create, edit/resolve/re-anchor via one tagged PATCH, delete), each mutating command attributed to the middleware-resolved principal and emitting a comment lifecycle event on the existing authoring outbox/SSE feed. Command functions wrap the repository mutation and the event append in one unit of work, so a served event never outruns the durable state. The single new command capability adds three command kinds, a comment id type, and a comment aggregate plus three event kinds; the blast radius was exactly the model and one transition-scope arm.

The displayed orphaned state is backend-served: the list route resolves each anchor against the CURRENT worktree body, which it reads through the confined document-read seam derived from the route node id - never a client-supplied path.

## Review findings and resolutions

- HIGH (path traversal / arbitrary-file-read): the first cut stored a client-supplied document path and later read it with an unconfined worktree read. Resolved by removing the client path entirely - from the create payload AND the stored record (the comment now identifies its document solely by node id, and the migration carries no path column). The worktree path is derived server-side from the node id through the confined document resolver plus snapshot reader, the same guarded seam the section-edit path uses; a missing or ambiguous node id is a typed 404. A regression test proves a traversal-shaped node id resolves to nothing and never leaks an outside-vault file.
- MEDIUM (false cap refusal on idempotent replay): a replay at exactly the per-document cap boundary was a false refusal because the gate counted the deterministic id's own existing row. Resolved by short-circuiting the cap gate for an already-existing id (an idempotent upsert of a row that already counts); a boundary-replay regression test locks it.
- LOW (creation-time divergence on replay upsert): the replay rewrote the JSON creation time while the column kept the original. Resolved by preserving the original creation time on replay; the boundary-replay test asserts the two agree.
- LOW (body byte-ceiling): the 16 KiB body cap is measured in UTF-8 bytes rather than grapheme count - accepted as a known, generous ceiling with no change.

## Verification

- Full Rust gate green: cargo fmt check clean on every touched file, clippy clean across all targets, and the authoring library suite at 720 passing tests (17 in the comment surface: store-level CRUD, both orphaning paths, the explicit re-anchor, the genuine 500-cap refusal, retention prune plus unresolved immunity, validation refusals, the boundary-replay regression, and route-level create/list/orphan/re-anchor/delete, SSE event emission, command-kind fencing, and the traversal-rejection security guard). No test doubles: every test exercises a real SQLite store, the real axum router, and real worktree files.
- Local-dev-store caveat: dropping the path column changed the version-20 migration after an intermediate cut. A developer's dev authoring-state sqlite that was already opened at the intermediate version 20 will not re-run the changed migration (migrations are keyed by version number), so it carries the stale intermediate schema. Recreate it with `just dev clean` before running the engine against this branch. Fresh stores and production are unaffected - they apply the final version-20 schema directly.
