---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:b9cea4fd707dd2b2e028555b4d5efad2994796340a87d82bd17d46475c3ce4bf'
step_id: 'S13'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Add a consumer test feeding a mock graph sample through adaptGraphSlice asserting new fields survive

## Scope

- `frontend/src/stores/server/liveAdapters.salience.test.ts`

## Description

## Outcome

Added `liveAdapters.salience.test.ts`: feeds mock graph output through `adaptGraphSlice` and asserts salience (lens-ordered), derivation (alongside tier), and embedding survive the real client path. 4 tests green.

Added `liveAdapters.salience.test.ts`: feeds mock graph output through `adaptGraphSlice` and asserts salience (lens-ordered), derivation (alongside tier), and embedding survive the real client path. 4 tests green.

## Notes
