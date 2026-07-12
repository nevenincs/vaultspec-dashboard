---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Serve bounded list, create, edit, resolve, and delete comment routes with actor-ref attribution and comment events on the authoring SSE channel

## Scope

- `engine/crates/vaultspec-api/src/authoring/http.rs`

## Description

- Add four comment routes to `authoring_router` in `engine/crates/vaultspec-api/src/authoring/http.rs`: `GET`/`POST /v1/documents/{node_id}/comments` and `PATCH`/`DELETE /v1/comments/{comment_id}`.
- Author the list handler as a principal-permissive read that lists bounded comments for a document, then resolves each anchor exact-or-conflict against the CURRENT worktree body read through the shared `ingest_struct::reader::read_from_worktree` seam (the same reader `SnapshotReader` and the section-edit path use), caching one read per distinct path; the served `orphaned` flag is backend-authoritative, and an unreadable document serves its comments as orphaned.
- Author the create/edit/resolve/re-anchor/delete handlers on the `ResolvedCommand` extractor so the author is the middleware-resolved principal (never a body claim), each fencing its command kind before any store work and mapping faults through the shared `command_error_response` taxonomy.
- Add request DTOs to `api.rs` (`CreateCommentRequest`, the tagged `CommentUpdateRequest`, `DeleteCommentRequest`) and a deterministic `mint_comment_id` (node id + idempotency key) so a create replay upserts rather than duplicates.
- Add comment command functions to `comments.rs` that wrap the repository mutation and the outbox event append in ONE unit of work, and add the `Comment` aggregate kind plus `comment.created` / `comment.updated` / `comment.deleted` event kinds and a `comment_event` builder to `events.rs`, riding the existing authoring outbox/SSE feed.
- Add the served-comment wire view (`ServedComment` with the flat `orphaned` boolean) and list caps to `comments.rs`.

## Outcome

Every built comment capability is reachable over the authoring HTTP surface with actor-ref attribution, the shared envelope + tiers block, and comment events on the existing SSE channel. Anchor resolution is backend-served and honest (exact-or-conflict, never a silent re-anchor). Route-level tests exercise the real router, real store, and a real worktree file end to end.

## Notes

- The `StoreError::Comment` to HTTP mapping arm (422 `authoring_comment_refused`) that the coordinating lane pre-added is CONFIRMED as the comment error surface: comment faults (empty/oversized body, malformed selector, cap reached, unknown comment on update/re-anchor) are client-correctable bad-request-shaped refusals; the leak-free domain reason is echoed. An unregistered author is a separate `StoreError::Actor` mapping to 403, unchanged. Delete of an absent id is idempotent (`deleted: false`, no error), so it never surfaces a not-found.
- Full Rust gate green: cargo fmt --check clean on every touched file, clippy clean, 720 lib tests pass (including the comment store + route tests).

### Review response (verdict WITHHELD, revisions landed)

- HIGH (path traversal / arbitrary-file-read): the create route accepted a client `document_path` and the list read it via a bare worktree read (no confinement, no cap). FIXED by removing `document_path` from the create payload AND the stored record entirely — the worktree path is now derived server-side from the route node id through the confined `DocumentResolver` (`resolve_existing`) plus `SnapshotReader`, the same guarded seam the section-edit path uses. The list reads the document body once from the node id; create validates the target exists through the resolver (a missing/ambiguous node id is a typed 404 `authoring_comment_document_not_found`). No client path is accepted or stored anywhere. A regression test proves a traversal-shaped node id resolves to nothing and never reads a file outside the vault.
- MEDIUM (false cap refusal on idempotent replay): the create cap gate counted the deterministic id's own existing row, so a replay at exactly the 500-cap boundary was a false 422. FIXED by short-circuiting the cap gate when the comment id already exists (an idempotent upsert of a row that already counts). Added the boundary-replay regression test.
- LOW (created_at divergence on replay upsert): the upsert rewrote `record_json.created_at_ms` to the replay time while the column kept the original, diverging the two. FIXED by preserving the existing record's `created_at_ms` on replay; the boundary-replay test asserts column and JSON agree.
- LOW (body byte-ceiling): the 16 KiB body cap is measured in UTF-8 bytes, not grapheme count — accepted as a known, generous ceiling (no change), noted here per the reviewer.
- Mandatory adversarial code review ran and WITHHELD; the four findings are resolved above and the gate re-run is green. Awaiting the reviewer's re-check before the steps are checked off.
