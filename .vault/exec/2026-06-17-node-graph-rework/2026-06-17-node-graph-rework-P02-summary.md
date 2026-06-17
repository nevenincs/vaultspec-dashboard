---
tags:
  - '#exec'
  - '#node-graph-rework'
date: '2026-06-17'
modified: '2026-06-17'
related:
  - "[[2026-06-17-node-graph-rework-plan]]"
---




# `node-graph-rework` `P02` summary

Tier 2 (performance and centering) is complete and verified live against the real
delta stream. Steps `P02.S09`-`P02.S14` are closed.

- Modified: `cosmosField.ts`
- Commit: `5299e80`

## Description

The renderer-only field gained three performance/stability mechanisms, all on the
static placement (the live d3-force driver lands in Tier 4):

- Content-signature dedup (FNV-1a over node ids + edge endpoints): an identical
  refetch is skipped wholesale - no re-upload, no re-place, no re-fit.
- Id-keyed slot retention: every node holds a stable phyllotaxis SLOT for its
  lifetime, freed slots are reused, and capacity only grows so the disc radius (and
  thus every surviving node's position) is stable. Survivors never move on a delta.
- Fit-once: the camera frames the field on first data and after a deliberate bound
  change, not on every refetch.

Render-on-demand falls out of the renderer-only design: with cosmos's sim OFF there
is no continuous loop, so the field is idle at rest and only re-uploads on a genuine
data or bound change.

Live verification (non-tautological, against the live stream): during a 2.6s window
the node count grew 3169 -> 3182 (the live-engine agent added documents) while every
sampled node stayed PIXEL-IDENTICAL - the no-bounce guarantee proven against real
deltas. A free->circle bound round-trip returns nodes to their exact slots. The D6
scale measurement: a full re-place + GPU upload + render at 3182 nodes is ~33ms (an
occasional cost on a bound change, never per-frame); idle GPU at rest.
