---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S229'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Per-document activity and count projections code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Run formal W11.P50 code review with a `vaultspec-code-reviewer` sidecar.
- Review full-corpus count rollups, activity bounds, document identity grouping,
  rebuildability, and real-store test coverage.
- Resolve the high bounded-read finding by adding a streaming repository helper
  and an explicit activity scan cap.
- Record the review findings in the feature audit.
- Rerun focused and package-level verification after the review fix.

## Outcome

S229 completed the W11.P50 review pass.

Findings:

- High: per-document activity served a capped page but used an unbounded
  full-corpus repository read before filtering. Resolved during S229 by adding
  `query_for_each` to the unit-of-work repository and changing activity reads to
  stream latest changeset rows until `cap + 1` matches or
  `MAX_DOCUMENT_ACTIVITY_SCAN_ROWS` is reached.
- Medium: per-document activity is currently a repository projection, not yet a
  mounted route or recovery snapshot surface. Accepted as an S230 surface
  verification/decision because S227 targeted `projections.rs`; S230 must either
  route/recover it or explicitly record why the repository projection is the
  backend-served surface for this increment.

The review was recorded in `2026-07-06-agentic-spec-authoring-backend-audit.md`.

Verification after the high finding fix:

- `cargo fmt --manifest-path engine/Cargo.toml --package vaultspec-api`
- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api authoring::projections::tests -- --nocapture`
- `cargo test --manifest-path engine/Cargo.toml -p vaultspec-api -- --nocapture`

## Notes

- Full package tests passed with exit code `0`. The output includes existing
  diagnostic logs from tests that intentionally exercise missing temporary
  `.vaultspec` directories and watcher failures.
