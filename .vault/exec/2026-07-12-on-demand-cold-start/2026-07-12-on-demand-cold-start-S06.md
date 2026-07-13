---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Benchmark the actual mobile cold load (bundle census + network + paint timings): production build chunk sizes and a Playwright mobile-viewport census of scripts, API, fonts, and first-paint

## Scope

- `scratchpad bench + dist stats`

## Description

Benchmark the real mobile cold load: production build census + Playwright mobile-viewport network/paint capture.

## Outcome

MEASURED (mobile 420px, dev serve + prod build): the mobile whale is JAVASCRIPT, not data - prod eager JS was 9.7MB raw / 1.85MB gzip with one 8,645KB vendor monolith; API total only ~761KB (vault-tree, already progressive); fonts 113KB. First contentful paint ~1.2s on localhost, gated entirely on bundle parse. Root cause of the monolith: the manualChunks catch-all pinned shiki's DYNAMICALLY-imported per-grammar modules into the eager vendor chunk. three.js (505KB) also eager, and leaks through sceneController -> cameraCore -> three into widely-imported scene modules, so deferring it needs a scene-layer decoupling (follow-up, a reviewed contract event).

## Notes
