---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S30'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the four named temporal correlation rules with per-rule confidence and independent provenance attribution

## Scope

- `engine/crates/ingest-git/src/correlate.rs`

## Description

- Implement the four named temporal correlation rules over (commit, record) pairs, descending confidence: explicit identifier in commit message (0.9, the opt-in core enrichment consumed opportunistically per U2), doc-and-code-in-one-commit (0.7), path-overlap within a plus/minus 3-day window (0.4), same-day co-activity (0.3).
- Every produced edge names the firing rule in its CommitCorrelation provenance - independently attributable per ADR D3.4; strongest rule wins per pair.

## Outcome

Temporal edges within the 0.3-0.9 band, ready for graph ingestion; all four rules plus precedence and window bounds covered by tests.

## Notes

The strongest-rule-wins precedence is an implementation choice (the ADR says rules are additive; emitting multiple edges per pair would double-count the same commit-record relationship). Flagged for phase review.
