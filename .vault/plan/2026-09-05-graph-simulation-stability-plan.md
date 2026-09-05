---
tags:
  - '#plan'
  - '#graph-simulation-stability'
date: '2026-09-05'
tier: L1
related:
  - '[[2026-07-03-graph-simulation-stability-adr]]'
  - '[[2026-06-29-graph-simulation-stability-adr]]'
  - '[[2026-09-05-graph-simulation-stability-force-balance-reference]]'
  - '[[2026-09-05-graph-simulation-stability-force-balance-audit]]'
modified: '2026-09-05'
body_schema: body-v2
body_hash: 'sha256:ff5033916cf0e279382a29ea721794d5e552f0670dcc46287c5b753bc2637967'
---

# `graph-simulation-stability` plan

## Description

Correct cluster propulsion through consistent degree-based inertia and symmetric repulsion. Repair the simulation clock and unintended energy-entry paths. Execute under the owner's review, fix and improve request.

## Steps

- [x] `S01` - Correct force inertia, frame cadence and unintended host energy entry; verify regression and existing stability contracts; `frontend/src/scene/three`.

## Parallelization

Force and host implementations have separate file ownership and may run together. Verification follows integration.

## Verification

Prove active momentum balance without cooling, mixed-radius separation, pin locality, refresh-independent ticking, and bounded performance. Run existing scene tests and full frontend lint and test gates. Complete independent code review.
