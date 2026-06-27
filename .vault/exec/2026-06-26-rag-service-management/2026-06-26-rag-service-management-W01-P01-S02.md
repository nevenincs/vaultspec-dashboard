---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S02'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Distinguish crashed from absent on the wire status and per-tier degradation block

## Scope

- `engine/crates/vaultspec-api/src/routes/stream.rs`

## Description

- Switch the `/status` route's rag block from the filesystem-only `discover` to the authoritative `probe_machine_state` (discovery + heartbeat + ungated `/health`, 1.5s bound).
- Emit an explicit tri-state on the wire: `state: "running"` (available, with pid + port), `"crashed"` (discovered but not serving, with reason + port), `"absent"` (no service, with reason).

## Outcome

Done. `/status` now distinguishes a crashed rag (stale heartbeat, malformed file, or `/health` unreachable/not-ready) from a genuinely absent one - the signal the lifecycle/console UI needs to decide attach-vs-start. `cargo build -p vaultspec-api` is green.

## Notes

The per-response `tiers` block (`query_tiers`) is deliberately left filesystem-only: it already distinguishes crashed vs absent through the `discover` reason text ("heartbeat stale ..." vs "not installed ..."), and adding a `/health` round-trip to the hot path would regress every wire response. The `/health` probe is paid only on the explicit `/status` poll. The probe is synchronous (consistent with the handler's existing sync `discover`/git calls) but bounded at 1.5s.
