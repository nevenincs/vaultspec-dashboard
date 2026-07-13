---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Serve the bounded in-flight pipeline projection from the mock engine for the fixture corpus, emitting the PipelineStatusResponse envelope with the tiers block byte-for-byte in the target wire shape

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Verified the mock serves the bounded `/pipeline` projection with the tiers block byte-for-byte; extended the mock to also emit `feature_tags` and `dates` on each artifact from the doc node.

## Outcome

The mock pipeline shape matches the live wire including the freshness/feature facets the surface consumes.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
