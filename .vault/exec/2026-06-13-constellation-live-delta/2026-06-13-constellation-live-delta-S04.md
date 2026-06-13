---
tags:
  - '#exec'
  - '#constellation-live-delta'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S04'
related:
  - "[[2026-06-13-constellation-live-delta-plan]]"
---

# Assert the keyframe seq anchor, feature-granularity diff, and granularity-tagged stream in conformance and certify end to end

## Scope

- `engine/crates/engine-query/src/graph.rs`

## Description

- Add a `feature_delta` unit test (engine-query): a new cross-feature meta-edge
  appears as a `feature`-tagged `add`, seqs contiguous from `seq_start`.
- Certify the wire behavior live against `vaultspec serve` over this repo's
  vault.

## Outcome

`feature_delta` unit test green (21/21 engine-query lib). Live e2e all green:
- live feature keyframe `last_seq` numeric; live document keyframe `last_seq`
  numeric; `as_of` keyframe `last_seq` null;
- `/graph/diff?granularity=feature` (HEAD~15..HEAD) returned 33 deltas, ALL
  tagged `feature`; the document diff returned 345 deltas, ALL tagged
  `document`.
Contract amended (sections 4/5/7); `vault check all` clean.

## Notes

DEVIATION from the step's stated scope (`conformance.rs`): the HTTP-level
conformance assertion was NOT added to `conformance.rs` because that file is
under heavy concurrent edit by the parallel agent (repeated mid-edit write
races). Coverage landed instead as the `feature_delta` unit test (committed,
CI) plus the manual live e2e above. A `conformance.rs` HTTP assertion (live
keyframe `last_seq` + feature-diff tagging) is a low-risk follow-up once the
file settles. The live constellation delta-apply consumer is the peer's
frontend lane (live-state ADR's flagged `spliceLive` step), now unblocked.
