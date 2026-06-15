---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S10'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the commit-log walk producing temporal event records with timestamp, kind, ref and touched paths

## Scope

- `engine/crates/ingest-git/src/log.rs`

## Description

- Implement the commit-log walk from any ref tip, newest first with a commit cap, producing (sha, unix timestamp, kind, ref, touched paths).
- Compute touched paths as the first-parent tree diff (full tree for root commits), filtering directory entries so only files report.
- Test ordering, per-commit path attribution, root-commit behavior, the cap, and loud failure on unknown refs.

## Outcome

The temporal ingestion source per engine-spec section 2.4: raw commit events ready for the W02 correlation rules and the persisted event log.

## Notes

gix 0.84 API note: the tree-diff callback returns `Result<ControlFlow>` and reports directory entries; both handled explicitly. Merge commits diff against first parent only in v1.
