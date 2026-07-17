---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-17'
step_id: 'S23'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Publish discovery immediately after the bind with a starting state and keep the heartbeat fresh through the initial index, flipping to ready before serving

## Scope

- `consumers (status seat block`
- `stop`
- `the launcher) read the state honestly (a starting seat reports starting`
- `stop can still terminate it via the pid fallback)`
- `engine/crates/vaultspec-api/src/boot.rs + engine/crates/vaultspec-api/src/discovery.rs + engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`

## Description

- Mint the bearer BEFORE the initial index (`mint_bearer` + `build_state_with_bearer`) and bind the port first, so discovery publishes a `starting` record the moment the port exists; the heartbeat task spawns pre-index and keeps the record fresh through the whole cold index, flipping to `ready` just before the wire serves.
- Discovery payload gains the lifecycle `state` field via the new `DiscoveryIdentity`; `SeatInfo` parses it tolerantly (absent on old records).
- Consumers: the `status` seat block reports a live-but-indexing seat as `state: starting`; `stop` can terminate a starting seat via the pid fallback (the graceful door does not exist yet) with an honest note.
- Boot-matrix test asserts the `ready` transition; live-verified `starting` observed mid-index, then `ready`, then graceful stop.

## Outcome

An indexing seat is now distinguishable from a dead one on every consumer surface; the heartbeat can no longer go stale during a long cold index.

## Notes

Closes the audit's provisional-starting-record recommendation and the boot-order-vs-discovery LOW finding.
