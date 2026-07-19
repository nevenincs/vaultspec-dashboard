---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S45'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Reuse the same typed product lifecycle authority for one-shot A2A status and mutation commands

## Scope

- `engine/crates/vaultspec-cli/src/cmd/a2a_lifecycle.rs`

## Description

- Added the one-shot `vaultspec a2a` module: MACHINE verbs over the SAME typed product lifecycle authority the seated plane uses (`LifecycleController` plus `guard_owned_mutation`), reading machine-global product state under the app home.
- Implemented the bounded, one-shot-safe action set: `status`/`doctor` read the product plus ownership projection; `stop` composes both ownership gates then authenticates and shuts the running owned gateway down over its loopback control endpoint; `remove` removes owned generations while preserving data.
- Deliberately did NOT expose process-spawning start/restart: the gateway is owned for its lifetime by the seated dashboard (ADR D4), so a one-shot that spawned then exited would orphan it - no permanently-half-working verb.

## Outcome

The one-shot lifecycle authority is reachable from the CLI, gate-consistent with the seated surface. Added `vaultspec-product` as a CLI dependency. cli tests plus clippy green.

## Notes

None.
