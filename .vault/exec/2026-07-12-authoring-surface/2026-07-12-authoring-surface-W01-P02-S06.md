---
tags:
  - '#exec'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-12-authoring-surface-plan]]"
---

# Model the comment entity anchored by the section selector, resolved exact-or-conflict on read into an honest orphaned flag, never a silent re-anchor

## Scope

- `engine/crates/vaultspec-session/src/authoring/comments.rs`

## Description

- Model the `CommentRecord` entity in `engine/crates/vaultspec-api/src/authoring/comments.rs`: id, a `CommentDocument` reference (stable node id plus advisory path), the shared `SectionSelector` anchor stored as JSON, a size-capped body, an `ActorRef` author, a resolved flag, and created/updated/resolved timestamps.
- Reuse the existing section selector and resolver rather than forking a second anchor model: the comment inherits the heading-path-plus-content-hash exact-or-conflict semantics.
- Implement list-for-document resolution that runs each stored anchor through the section resolver against the current document body, producing a `CommentAnchorState`: an exact match is `Anchored`; a missing heading, an ambiguous heading, or a content-hash mismatch is `Orphaned` carrying typed evidence mirroring the resolver's own conflict vocabulary.
- Guarantee resolution never mutates the stored selector: re-anchor-to-current is the explicit `reanchor` mutation that persists a caller-supplied fresh selector computed from the current section state.
- Attribute every comment to the shared editor actor ref (single-principal V1 by ADR) with the model carrying the ref so attribution upgrades in place when per-human identity lands.

## Outcome

Comments anchor to heading sections exactly-or-conflict and orphan honestly when the commented section drifts, never silently re-anchoring. Module tests cover the anchored round-trip, content-hash-mismatch orphaning after a section edit, missing-anchor orphaning after a heading removal, the explicit re-anchor mutation re-binding to the current section, edit/resolve/reopen/delete, the per-document cap refusal, retention pruning of long-resolved comments, unresolved-comment retention immunity, oversized-body and empty-selector refusals, and unregistered-author refusal.

## Notes

- The pure resolution functions (`resolve_comment_anchor`, `resolve_comment`, `resolve_comments`) take the document body as an argument and hold no store handle, so the HTTP layer resolves against the working-tree body it reads; the store never needs the document content.
- Heading-section granularity is the honest V1 scope (ADR constraint): inline/sub-paragraph anchoring needs a finer selector and is a named non-goal.
- Comment event vocabulary on the authoring SSE channel and the routes belong to S07 (`http.rs`), deferred pending the orchestrator go-ahead.
