---
name: rag-is-a-machine-singleton-the-dashboard-attaches-never-owns
---

# rag is a machine singleton: the dashboard attaches, it never owns the lifecycle

## Rule

Treat vaultspec-rag as ONE resident service per machine whose authority is the OS
machine lock (not a PID/file the dashboard owns): determine "running" from
machine-global discovery (`~/.vaultspec-rag/service.json`) plus heartbeat freshness
plus an ungated `GET /health` `status=="ready"` with a live pid, manage whatever
service is running regardless of who started it, and start your OWN only when one is
genuinely absent — never speculatively, never per-workspace, attaching (never
erroring / 502) on an already-running or lost-race start.

## Why

The `2026-06-26-rag-service-management-adr` (D1/D2) settled this after rag `0.2.25`
hardened into a single-resident-service-per-machine, multi-tenant architecture: one
process owns the GPU and the managed Qdrant and serves every project as a tenant,
enforced by an OS advisory lock, and `server start` emits no JSON and exits 1 when
already running. The failure modes the rule prevents are the engine mapping an
already-running `server start` to `HTTP 502` (the race loser errors against a healthy
service) and modeling rag lifecycle as a per-scope resource an operator "stops for
this workspace" while silently stopping every consumer's service. Gate-then-
re-discover-and-attach makes the dashboard a correct co-equal manager of the one
machine rag.

## How

- **Good:** gate `server start` on the D1 running-predicate (`probe_machine_state`:
  machine-global discovery + heartbeat + `GET /health` `status=="ready"` + live pid);
  treat exit 0 as started and a non-zero already-running / machine-owned exit as the
  signal to re-run the predicate and ATTACH ("attached to the machine service"). The
  lifecycle dispatch passes no `--json` to `server start` / `server stop` (rag 0.2.25
  rejects it).
- **Bad:** mapping an already-running `server start` to a 502 error envelope, starting
  a service speculatively before confirming genuine absence, or modeling rag lifecycle
  as a per-scope resource keyed on the workspace.

## Status

Active. Promoted at the close of the `rag-service-management` cycle (research → ADR
accepted → plan → execute → review PASS with revisions resolved), in which the
gate-then-attach lifecycle path was built and reviewed against rag `0.2.25` as
shipped. Sibling of [[rag-data-rides-the-codified-contract-not-the-qdrant-shape]],
[[dashboard-does-not-override-rag-status-dir]], [[engine-read-and-infer]],
[[dashboard-layer-ownership]], and [[every-wire-response-carries-the-tiers-block]].

## Source

ADR `2026-06-26-rag-service-management-adr` (decisions D1, D2) and research
`2026-06-26-rag-service-management-research`. Guards: the rag-client
`probe_machine_state` predicate and the `start_rag_service` attach path; rag `0.2.25`
single-machine multi-tenant model (`_machine_lock.py`, an OS advisory lock on
`service.lock`).
