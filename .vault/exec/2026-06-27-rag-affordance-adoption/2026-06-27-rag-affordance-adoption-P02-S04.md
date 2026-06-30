---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S04'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

# Detect an older rag rejecting --json on the spawn path and retry the start without it

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `rag_rejected_json` (a non-zero exit whose combined output contains "no such option" + "--json" = an older rag rejecting the flag) and, in `start_rag_service`'s spawn path, a retry of the plain start (args minus `--json`) when it fires.

## Outcome

The adoption is version-tolerant: against a rag that predates the JSON-start contract, the start retries without `--json` and continues with today's logic - so the change is safe to merge against any rag version, no cross-repo release ordering.

## Notes

A false negative leaves a genuine failure (already failing); a false positive retries once and reaches the same failure - both converge to today's outcome.
