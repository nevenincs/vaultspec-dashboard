---
tags:
  - '#exec'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
step_id: 'S10'
related:
  - "[[2026-06-18-document-edit-hardening-plan]]"
---




# Extend post-write invalidation so the open editor content view re-reads after backend re-ingest

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add `content` and `file-tree` to `GRAPH_GENERATION_QUERY_SUBTREES` in `frontend/src/stores/server/queries.ts`, so a watcher/SSE generation bump (a re-ingest that was NOT a local mutation - an external edit, a rename, or another client's write) invalidates the open reader/editor's served bytes and the file-tree projection, not just the graph subtrees.
- tsc + eslint + prettier clean; committed `4f2e9aa`.

## Outcome

The backend->frontend re-ingest signal now reaches the OPEN document: previously a generation bump refreshed the graph/tree/node projections but left the open reader/editor showing stale bytes (content was absent from the gen-bump subtree list). This closes that gap (component 5's "POST-driven re-ingest that signals the frontend"), and is what lets a rename or an external edit refresh the open document.

## Notes

- This is the invalidation LOGIC (proven correct by inspection + tsc/eslint/prettier): on a gen bump, `[...all, content, scope]` and `[...all, file-tree, scope]` prefixes are invalidated, so observed (open) content/file-tree queries re-fetch. The end-to-end LIVE proof (an open editor visibly refreshing after a re-ingest) is part of the W05 integration pass, which needs the full edit flow - the rename broker (W02.P03, `ops.rs` locked) and the editor UI (`MarkdownDocView.tsx` locked).
- Unblocked because `queries.ts` was committed by its concurrent owner this session; the editor re-key half (S09) remains blocked on `viewStore.ts`/`editor.ts`.
