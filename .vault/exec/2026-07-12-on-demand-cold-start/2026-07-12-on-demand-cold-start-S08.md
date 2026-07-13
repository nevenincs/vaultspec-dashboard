---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Stop pinning lazily-imported registries into the eager vendor chunk: exempt the shiki grammar/theme modules so they emit as natural async chunks, and isolate the three.js scene stack as its own cacheable vendor-scene chunk

## Scope

- `frontend/vite.config.ts`

## Description

Fix the chunk strategy in vite.config.ts: exempt /@shikijs/ from the vendor catch-all so the grammar registry emits as natural per-language async chunks (loaded on first highlight of that language), and split three.js into its own vendor-scene chunk.

## Outcome

Eager JS drops 9.7MB/1.85MB-gzip -> ~2.2MB/~620KB-gzip (vendor 8,645KB -> 630KB). Grammar chunks now load on demand; vendor-scene (505KB) is isolated + cacheable, with its full deferral blocked on the sceneController->cameraCore three import (documented follow-up).

## Notes
