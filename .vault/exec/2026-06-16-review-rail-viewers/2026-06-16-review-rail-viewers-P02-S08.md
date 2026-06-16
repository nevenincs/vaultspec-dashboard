---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S08'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Add a tolerant content adapter normalizing the wire shape, blob_hash content-addressing the cache entry

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Add the `ContentResponse` and `ContentTruncated` wire types and the `content(id, scope?)` client method, encoding the node id with `encodeURIComponent` so a code-path id's slashes stay one segment.
- Add the tolerant `adaptContent` adapter normalizing the wire shape, defaulting every field to a safe empty so a sparse or older shape never throws, with the `blob_hash` content-addressing the cache entry.

## Outcome

The adapter normalizes the live and mock shapes into one internal `ContentResponse` the viewers consume. Adapter tests stay green.

## Notes

None.
