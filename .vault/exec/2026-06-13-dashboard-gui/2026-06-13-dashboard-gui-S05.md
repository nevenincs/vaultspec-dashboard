---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-13'
step_id: 'S05'
related:
  - "[[2026-06-13-dashboard-gui-plan]]"
---




# Assert the live meta_edges fold and member_count carry in a consumer test and verify the rendered constellation end to end

## Scope

- `frontend/src/scene/sceneMapping.test.ts`

## Description

- Assert the live `meta_edges` fold and `member_count` carry in a
  consumer-shaped test (the mock now serving the live separate-meta_edges
  shape): a feature-granularity query yields feature nodes with sized
  member counts and folded feature-to-feature edges.
- Verify the rendered constellation end to end through the scene mapping —
  nodes present, meta-edges connecting, no empty-edge regression.

## Outcome

The constellation half of the S49 live-origin divergence is closed and
guarded: 235 vitest tests pass (8 new across liveAdapters, mockEngine,
sceneMapping, nodeSprites); typecheck, eslint, build, prettier clean.

## Notes

The consumer test asserts against the reconciled mock (S03), which now
matches the live wire shape — so the test catches a future drift in the
fold or the member_count carry engine-side before the stage renders empty.
