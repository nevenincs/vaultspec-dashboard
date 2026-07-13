---
tags:
  - '#plan'
  - '#global-state-review'
date: '2026-07-03'
modified: '2026-07-12'
tier: L1
related:
  - '[[2026-07-03-global-state-review-adr]]'
---

# `global-state-review` plan

- [x] `S01` - Add the view-local session-intent freshness seam: bounded guarded-localStorage per-scope activity stamps plus the pure staleness derivation and the 8h window constant, with unit tests; `frontend/src/stores/view/sessionIntentFreshness.ts`.
- [x] `S02` - Add the one-shot-per-scope stale-session-intent boot heal hook beside the timeline heal (clear selection through selectionPatch when the scope's stamp is stale, stamp on boot and on selection changes) and mount it in Stage; `frontend/src/stores/server/queries.ts + frontend/src/app/stage/Stage.tsx`.
- [x] `S03` - Verify: unit tests, full gate, live headless proof (injected stale stamp clears a persisted selection on boot; `fresh stamp resumes it); `frontend/src + just dev lint frontend`.

## Description

## Steps

## Parallelization

## Verification
