---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-18'
body_hash: 'sha256:6c8616ccc142d7486db7ffa08647eefa9352f39971facacc07f08aec2534ab6e'
step_id: 'S16'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# render day bucket guides and hotspot cues without replacing individual document nodes

## Scope

- `frontend temporal visual treatment`

## Description

- Add day bucket guide lines and hotspot rings over the temporal Cosmos canvas.
- Scale hotspot opacity from bucket density while keeping the document nodes visible.
- Clamp guide radius so bucket cues do not become aggregate marks.

## Outcome

Temporal mode now shows day density as auxiliary hotspot cues while preserving the individual Cosmos-rendered document nodes as the primary marks.

## Notes

The overlay is visual evidence only; temporal positions remain authored by the scene data sent to Cosmos.
