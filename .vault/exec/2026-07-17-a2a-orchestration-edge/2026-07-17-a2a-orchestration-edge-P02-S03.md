---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S03'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Build the ops a2a verb namespace on the rag ops template forwarding the five whitelisted verbs to the a2a v1 gateway with bounded arg validation, verbatim sibling envelope inside the tiers envelope, degraded-tier 200 on sibling-down, 502 on crash or timeout, and attach-never-own discovery

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/`

## Description

- Add `mod a2a` under `routes/ops/`, mirroring the shipped rag ops module's shape: whitelisted verb dispatch, bounded arg validation, and a discovery predicate that attaches to a running sibling rather than owning its lifecycle.
- Forward the five whitelisted a2a v1 gateway verbs (run-start, run-status, run-cancel, presets-list, service-state) through `POST /ops/a2a/{verb}`, registered in `build_router` and added to `CONTRACT_ROUTES`.
- Return the sibling's response envelope verbatim, nested inside the engine's own `tiers` envelope, per the wire-contract rule that every response — success or degraded — carries `tiers`.
- Degrade to a `200` with a degraded tier when the sibling is known-down (attach-never-own discovery finds no live gateway), reserving `502`/`504` for a subprocess crash or timeout, matching the rag ops template's established sibling-down semantics rather than the edge ADR's original 502-on-down wording (P05 amends the ADR to record this).

## Outcome

Landed at commit `fd7069cb01` alongside S04/S05 (the `a2a.rs` module and its `mod`/route wiring in `routes/ops/mod.rs` and `lib.rs`). `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification, re-confirmed compiling clean by ops before commit).

## Notes
