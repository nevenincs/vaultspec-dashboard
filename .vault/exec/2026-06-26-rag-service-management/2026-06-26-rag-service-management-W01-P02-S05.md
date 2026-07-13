---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Gate server-start on the predicate returning genuinely-absent and map machine-owned to attach-and-succeed

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Gate `start_rag_service` on the machine-global running-predicate FIRST: if `probe_machine_state` reports Running, return `status:"already_running", attached:true` (pid + port) WITHOUT spawning anything - the dashboard never starts speculatively.
- Map a lost start race to attach: when the post-start re-probe is Running after a non-zero exit (the machine-lock guard refused our second service because a CLI/MCP/other dashboard won), report `status:"machine_owned", attached:true` rather than an error.
- Restructure the lifecycle dispatch to branch by verb: `server-start` -> `start_rag_service`, `server-stop` -> `stop_rag_service` (also `--json`-free), and `server-status`/`-doctor`/`-install` keep the shared JSON sibling runner; unknown verbs still 403.

## Outcome

Done. `server start` is now only ever invoked when the machine service is genuinely absent, and every already-running / machine-owned path attaches and succeeds. `cargo build -p vaultspec-api` is green. This satisfies the acceptance criteria: a dashboard launched while rag is running attaches with zero start attempts and zero error envelopes; a racing-start loser attaches instead of 502-ing.

## Notes

`server stop` is routed through the new capture handler too (it is machine-global - stopping it stops every consumer); the machine-wide blast-radius copy is deferred to the stores/console UI (S06 / W04). The crashed state is treated as absent for the start ATTEMPT (per the ADR) but the start only "succeeds" if the re-probe is actually Running.
