---
tags:
  - '#plan'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
tier: L1
related:
  - '[[2026-07-12-on-demand-cold-start-adr]]'
---

# `on-demand-cold-start` plan

- [x] `S01` - Build useProgressiveGraphSlice: wrap useGraphSlice so a live, cold, document-granularity request serves the same-identity feature-LOD slice as held data (isPending masked) until the document slice lands; `bypass for asOf; memoized result object; `frontend/src/stores/server/queries.ts`.
- [x] `S02` - Consume the progressive hook in Stage in place of the raw slice hook, unchanged scene contract; `frontend/src/app/stage/Stage.tsx`.
- [x] `S03` - Yield briefly between vault-tree continuation pages so the background drain never contends with first paint or first interaction; `frontend/src/stores/server/engine.ts`.
- [x] `S04` - Test the progressive slice (cold fill, passthrough on data, asOf bypass, refreshing availability during fill) and the paced drain; `frontend/src/stores/server/queries.test.ts + engine.test.ts`.
- [x] `S05` - Run the full gate, live-verify cold-start payloads and first paint, review the diff, commit; `frontend (full gate) + live verify`.
- [x] `S06` - Benchmark the actual mobile cold load (bundle census + network + paint timings): production build chunk sizes and a Playwright mobile-viewport census of scripts, API, fonts, and first-paint; `scratchpad bench + dist stats`.
- [x] `S07` - Add the instant pre-hydration boot shell: an inline-styled static skeleton in index.html painting before any bundle downloads, retired on AppShell's first commit with a main.tsx backstop; `frontend/index.html + frontend/src/main.tsx + frontend/src/app/AppShell.tsx`.
- [x] `S08` - Stop pinning lazily-imported registries into the eager vendor chunk: exempt the shiki grammar/theme modules so they emit as natural async chunks, and isolate the three.js scene stack as its own cacheable vendor-scene chunk; `frontend/vite.config.ts`.

## Description

## Steps

## Parallelization

## Verification
