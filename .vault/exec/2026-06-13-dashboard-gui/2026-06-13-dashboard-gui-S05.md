---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-13'
modified: '2026-07-12'
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
guarded: 237 vitest tests pass (10 new across liveAdapters, mockEngine,
sceneMapping, nodeSprites, queries); typecheck, eslint, build, prettier
clean; engine `cargo test --workspace` unchanged-green; `vault check all`
clean. Verified end to end against a live `vaultspec serve` origin: the e2e
smoke "constellation renders from the live graph" passes, and a PixiJS
extract readback confirms three feature-convergence glyphs rendering sized by
member_count (the scene holds three nodes and six folded meta-edges from the
live feature query). The post-closure review's findings landed as one
revision before closure: the ADR §9a seam-redline record, the
empty-breakdown dominant-tier default plus its tie test.

## Notes

The consumer test asserts against the reconciled mock (S03), which now
matches the live wire shape — so the test catches a future drift in the
fold or the member_count carry engine-side before the stage renders empty.
