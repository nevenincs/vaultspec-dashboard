---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-06-13-dashboard-gui-plan]]"
---

# Reconcile the mock engine and corpus fixture to the live separate-meta_edges wire shape under both granularities

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Reconcile the mock engine to the live wire shape: emit feature-convergence
  nodes with `member_count` and a separate top-level `meta_edges` array at
  feature granularity, and document nodes with `edges[]` at document
  granularity — matching the live origin under both granularities.
- Extend the corpus fixture with the feature-tag data the constellation
  needs so the mock and live paths exercise the same adapter.

## Outcome

The mock now mirrors the live separate-meta_edges contract, so tests written
against the mock catch the same shape the live origin serves — closing the
gap that let the constellation ship rendering zero edges.

## Notes

This is the divergence's root cause: the original mock folded meta-edges into
`edges[]` and never served feature granularity, so the GUI was never tested
against the real shape.
