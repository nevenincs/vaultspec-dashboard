---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S43'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add a conformance test feeding a captured live salience sample through adaptGraphSlice and the same client path the app uses, asserting lens default and salience fidelity

## Scope

- `frontend/src/stores/server/liveAdapters.test.ts`

## Description

## Outcome

Added a live-sample conformance test (liveAdapters.test.ts): a captured live /graph/query salience envelope fed through unwrapEnvelope + adaptGraphSlice (the same client path the app uses) asserting the lens default, salience fidelity per node, the descending-salience order, and salience_partial when a tier is degraded. Plus mock parity tests for the salience field + two-lens orderings.

## Notes
