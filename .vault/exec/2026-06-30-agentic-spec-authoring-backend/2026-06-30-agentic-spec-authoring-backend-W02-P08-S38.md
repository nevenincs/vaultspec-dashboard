---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S38'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add retention tests for pending approvals, applied preimages, rejected transcripts, compaction limitations, and backup export coverage

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/retention.rs`

## Description

- Add real SQLite tests for protected pending approval compaction attempts.
- Add apply receipt protection and backup coverage tests.
- Add rollback preimage limitation and rollback-limitation refresh regression
  tests.
- Add rejected transcript compaction, bounded compaction, and explicit optional
  transcript backup omission tests.

## Outcome

Retention coverage proves protected product records stay full, rollback
preimage compaction requires an explicit limitation, terminal transcripts can be
summarized under policy, bounded compaction reports remaining work, and backup
manifests include or explicitly omit each record class.

## Notes

The tests use the real `Store::open` and `Store::with_unit_of_work` path.
