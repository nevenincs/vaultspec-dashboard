---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Carry real ADR status and plan tier as doc-node facets on the mock fixture corpus so an ADR mock row reads a real status word and a plan mock row reads a real tier

## Scope

- `frontend/src/testing/fixtures/corpus.ts`

## Description

- Verified the fixture corpus carries real ADR status (proposed/accepted/rejected/deprecated) and plan tier (L1-L4) as doc-node facets, with deterministic spread so both included and excluded artifacts exist.

## Outcome

A mock ADR row reads a real status word and a mock plan row reads a real tier.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
