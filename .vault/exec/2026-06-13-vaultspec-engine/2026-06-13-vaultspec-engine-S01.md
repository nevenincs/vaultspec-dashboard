---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S01'
related:
  - "[[2026-06-13-vaultspec-engine-plan]]"
---

# Accept millisecond timestamps on as-of and diff inputs by resolving the latest commit at or before T on the scope ref, alongside the existing revision form

## Scope

- `engine/crates/engine-graph/src/asof.rs`

## Description

- Add `resolve_commit`: rev-parse the token first; on failure, if the token is
  all digits, treat it as a millisecond timestamp and walk HEAD history for the
  latest commit whose committer time (seconds x 1000) is at or before T.
- Route `asof_graph` through `resolve_commit` and read historical blobs at the
  resolved sha (a timestamp token is not a revision the blob reader can parse).
- Enrich the as-of document nodes with title, doc_type, frontmatter date, and
  lifecycle so the historical view matches the section 4 list shape; modified
  stays null on blob-true views.
- `/graph/diff` inherits the same resolution via the shared as-of construction.

## Outcome

Millisecond timestamps and revisions are both accepted on `/graph/asof` and
`/graph/diff`; conformance divergence 1 is green (as-of at now resolves the
latest corpus, T1-to-now diff carries the plan addition, the HEAD~1 revision
form still works). The GUI time-travel smoke leg is unblocked.

## Notes

Digit-only tokens are the sole timestamp trigger; a non-numeric token that fails
rev-parse propagates the original revision error untouched. A timestamp older
than the root commit errors explicitly rather than returning an empty graph.
