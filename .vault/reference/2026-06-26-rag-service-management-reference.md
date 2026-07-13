---
tags:
  - '#reference'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
related:
  - "[[2026-06-26-rag-service-management-adr]]"
---

# `rag-service-management` reference: `shared rag service contract and coordination asks`

The mutually-referenced contract between vaultspec-dashboard and vaultspec-rag for the
single-machine, multi-tenant rag service (rag `0.2.25`+), plus the coordination asks the
dashboard files back to the rag team. This is the artifact both repos cite for the shared
definition of "running" and the discovery/`VAULTSPEC_RAG_STATUS_DIR` contract (the cycle's
acceptance criterion: "a written, mutually-referenced invariant exists in both repos' vault
docs"). The rag team's handover brief is the originating source; this reference is the
dashboard-side record of the settled contract.

## The shared definition of "running" (the §4 predicate)

rag is ONE resident service per machine — authority is the OS advisory machine lock
(`service.lock` beside the machine-global Qdrant storage), never a file's existence or a PID
file. Both repos determine rag state in this order, MACHINE-GLOBALLY (never a per-scope
status file):

1. **Discover** `~/.vaultspec-rag/service.json`. Missing/unreadable -> candidate ABSENT.
2. **Heartbeat fresh?** `now - last_heartbeat` within the staleness window. Stale -> CRASHED
   (surfaced distinctly, treated as absent for start purposes).
3. **Liveness confirm** via ungated `GET /health`: `status == "ready"` with a live `pid` ->
   RUNNING. This is the authoritative "a service exists on this machine" signal.
4. Only a genuine 1-3 miss is ABSENT — the only state in which the dashboard may start its
   own service. Even then, an `exit 0` ("started"/"already running") or a non-zero
   already-running/machine-owned start re-discovers and ATTACHES; it is never an error.

Dashboard implementation: `rag-client` `probe_machine_state` (off the per-response hot path,
which stays filesystem-only) + `start_rag_service` (gate -> capture -> attach/settle). Note:
`server start`/`server stop` carry NO `--json` flag on rag `0.2.25`; the lifecycle runner
must not append one.

## The discovery / `VAULTSPEC_RAG_STATUS_DIR` invariant

rag is machine-global at `~/.vaultspec-rag/service.json`. **The dashboard does NOT override
`VAULTSPEC_RAG_STATUS_DIR`** and the machine-global discovery candidate wins over any
per-scope file. Overriding STATUS_DIR per scope fragments discovery while the machine lock
still allows exactly one service, so N-1 scopes would fail discovery / 502 on start. If
per-scope isolation is ever required, switch discovery to a STATUS_DIR-independent machine
pointer (the lock-holder pid) — coordinated with rag FIRST. Codified as
`dashboard-does-not-override-rag-status-dir`.

## The three-tier data contract

- **Tier 1 — rag HTTP (codified, version-tolerant):** `/service-state`, `/storage/survey`,
  `/jobs`, `/projects`, `/metrics`, `/health`, `/readiness`. Size/state/lifecycle/data ride
  this with zero dependency on rag's internal Qdrant shape.
- **Tier 2 — Qdrant's own documented REST (semi-stable, capability-gated):** the
  optimizer/segment/indexed health rag does not expose, read via `GET /collections/{name}`
  using a name from `/storage/survey` (never recomputed), gated on the Qdrant version,
  degrading fail-closed on mismatch.
- **Tier 3 — gaps requiring rag (the asks below).** Codified as
  `rag-data-rides-the-codified-contract-not-the-qdrant-shape`.

## Coordination asks filed back to rag (issue-ready)

These are NON-BLOCKING (the dashboard ships self-contained against `0.2.25`); they remove
future parsing/recompute burden. Each is an issue-ready body for the vaultspec-rag repo —
filing to GitHub is pending owner go-ahead (an outward action).

1. **HTTP repair routes (`POST /storage/prune`, `POST /collections/{name}/optimize`).** rag
   exposes no HTTP prune/compact/optimize today; the only remediation over HTTP is
   `reindex clean=true` + `projects/evict`. Surfacing prune (orphaned namespaces) and
   optimize over HTTP would let the dashboard's DIAGNOSTICS offer true repair instead of a
   disabled-with-reason affordance. (Brief §3 D6, §5.)
2. **A `contract_version` (or `schema_version`) on `/health`.** `/health` carries only the
   Qdrant binary version, `service_token`, and constant `backend_capabilities` (no version
   discriminator). A declared rag contract version lets the dashboard capability-gate the
   Tier-2 Qdrant reads cleanly instead of inferring from the Qdrant major. (Brief §4.)
3. **(Optional) `server start --json` exiting 0 with `{"status":"already_running", pid,
   port}` for a healthy owned service.** Removes the dashboard's need to gate-then-attach by
   re-discovery; reorder the idempotent check before the guards. (Brief §6.)
4. **(Optional) A STATUS_DIR-independent machine pointer** (the lock-holder pid exposed over
   a small CLI/HTTP surface) for the day the dashboard needs per-scope isolation without
   fragmenting discovery. (Brief §6, D3.)

## Sources

- The rag team's handover brief (cross-project service-management audit, rag `0.2.25`).
- ADR `2026-06-26-rag-service-management-adr` (D1-D8) and research
  `2026-06-26-rag-service-management-research` (the three-tier grounding).
- Dashboard guards: `rag-client` `probe_machine_state` / `service_json_candidates`,
  `vaultspec-api` `start_rag_service` / `rag_collection_health`, and the codified rules
  `rag-is-a-machine-singleton-the-dashboard-attaches-never-owns`,
  `rag-data-rides-the-codified-contract-not-the-qdrant-shape`,
  `dashboard-does-not-override-rag-status-dir`.
