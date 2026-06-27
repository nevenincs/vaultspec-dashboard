---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S41'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Test the active-lens store default and setter, the lens-keyed query re-fetch, the focus loading state, and the tiers-based degradation read

## Scope

- `frontend/src/stores/view/salienceLens.test.ts`

## Description

## Outcome

Tests (salienceLens.test.ts): the store default (status) + setters, the lens-keyed and focus-keyed query cache (a switch is a re-query, omitted keys to status/none), the focus-change loading state, and the tiers-based degradation read including fresh-error-wins and the bare-transport-error-is-not-partial case. 87 green across the salience test files.

## Notes
