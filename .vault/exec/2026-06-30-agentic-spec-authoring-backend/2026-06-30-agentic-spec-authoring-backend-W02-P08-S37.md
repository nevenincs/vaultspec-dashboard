---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
body_hash: 'sha256:c7a836ec1be58511913795a687d287c489d2ee36b8b28be56cb630c11056625c'
step_id: 'S37'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement retention classes, compaction markers, backup export metadata, protected preimage rules, and status reporting

## Scope

- `engine/crates/vaultspec-api/src/authoring/store/retention.rs`

## Description

- Add schema version 3 and retention metadata tables for records, compaction
  runs, compaction markers, backup exports, and backup export items.
- Add `UnitOfWork::retention` and typed retention enums for classes, lifecycle
  status, payload state, and compaction disposition.
- Implement record upsert, single-record compaction, bounded due compaction,
  backup manifest export, marker lookup, and status reporting.
- Preserve compacted rollback limitations across later metadata refresh upserts.

## Outcome

The authoring store now has retention and backup metadata primitives that later
repositories can attach to without giving transient generation artifacts the
same authority as approvals, receipts, preimages, or audit records.

## Notes

W02.P08 does not create proposal, approval, changeset, apply, rollback, outbox,
route, frontend, or LangGraph domain behavior.
