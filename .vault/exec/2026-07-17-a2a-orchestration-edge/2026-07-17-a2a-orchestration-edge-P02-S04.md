---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S04'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Provision per-role actors and engine-minted tokens at run-start and inject the ActorTokenBundle into the forwarded payload, never logging token values

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/`
- `engine/crates/vaultspec-api/src/authoring/`

## Description

- Provision per-role actors and mint engine-side `ActorTokenBundle` tokens at run-start, inside the `ops_a2a` verb dispatch for the run-start verb specifically.
- Inject the minted token bundle into the forwarded payload before it crosses to the a2a gateway, so the gateway receives engine-issued credentials rather than trusting a caller-supplied identity.
- Never log token values at any point on the forward path (request build, response handling, or error paths) — token material stays out of every log level.

## Outcome

Landed at commit `fd7069cb01` alongside S03/S05, in the same `a2a.rs` module. `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification).

## Notes
