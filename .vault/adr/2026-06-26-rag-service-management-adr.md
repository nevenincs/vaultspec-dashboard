---
tags:
  - '#adr'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
related:
  - "[[2026-06-26-rag-service-management-research]]"
---

# `rag-service-management` adr: `rag operations console over a single-machine multi-tenant service` | (**status:** `accepted`)

## Problem Statement

vaultspec-rag hardened (shipped `0.2.24`, audited `0.2.25`) into a **single-resident-service-
per-machine, multi-tenant** architecture: one process owns the GPU and the managed Qdrant
and serves every project as a tenant, enforced by an OS advisory lock. The dashboard still
treats rag lifecycle as something it owns per workspace. A cross-project audit from the rag
team named six drifts (`D1`–`D6`); this research grounded them against the dashboard's
current engine/stores code and rag's real `0.2.25` source, and the project owner expanded
the goal: the dashboard must ship a real **rag operations console** — a UI plus a paired
Rust backend that can exercise rag's full lifecycle, per-tenant data management + repair,
and diagnostics, with size/state computed performantly in Rust. The load-bearing risk the
owner flagged: rag's Qdrant collection/payload/storage shape is **not a codified contract**.
This ADR records how the dashboard aligns to rag's model and which contract each part of the
console is built on. The worktree was first upgraded to the published baseline
(`vaultspec-core 0.1.34`, `vaultspec-rag 0.2.25`).

## Considerations

- **rag is a machine resource, not a workspace resource.** The machine lock
  (`_machine_lock.py`, an OS advisory lock on `service.lock` beside the machine-global Qdrant
  storage, independent of `VAULTSPEC_RAG_STATUS_DIR`) is THE authority for "one service per
  machine." The dashboard is one of several co-equal consumers (CLI, MCP, other dashboards);
  it must manage whatever service is running regardless of who started it, and start its own
  only when one is genuinely absent.
- **`server start` emits no JSON and exits 1 when already running.** Guard order: port
  in-use → exit 1; machine-lock held → exit 1 (message carries holder pid); healthy-owned →
  exit 0 "Service already running." There is no `--json` flag; all output is human Rich text.
  So the brief's proposed D1 fix (clone the write-runner's stdout-`status` inspection onto
  the lifecycle path) cannot work — there is nothing to parse.
- **The dashboard already brokers rag's HTTP control plane correctly** as a multi-tenant
  consumer (every `reindex`/`watcher`/`projects`/`search` verb carries `project_root`, and
  unavailable rag degrades to a `200` with a degraded tier per
  `every-wire-response-carries-the-tiers-block`). The drifts are concentrated in the
  service-LIFECYCLE path, not the control plane.
- **The storage-schema gap sorts the console into three contract tiers** (grounded in the
  research): Tier 1 = rag's codified HTTP (`/service-state` counts+GPU+watcher+qdrant,
  `/storage/survey` disk-bytes+points+collection-names+orphan-status, `/jobs`, `/projects`,
  `/metrics`, `/health`, `/readiness`); Tier 2 = Qdrant's OWN documented REST API for the
  repair-signalling health rag does not expose (optimizer status, segments,
  indexed-vs-total), capability-gated on the Qdrant version; Tier 3 = genuine gaps requiring
  rag coordination (NO HTTP prune/optimize/compact route; NO rag/contract version in any HTTP
  response).
- **Standing rules constrain the shape.** `engine-read-and-infer` (no rag semantics in the
  engine; only forward whitelisted verbs and read-and-infer over Qdrant), `dashboard-layer-
  ownership` (stores is the sole wire client; the new console is chrome that consumes stores),
  `degradation-is-read-from-tiers-not-guessed-from-errors`, `bounded-by-default-for-every-
  accumulator` and `subprocess-calls-carry-cap-and-timeout` (the new Rust aggregation must be
  bounded + memoized; spawns keep cap+timeout), `figma-is-the-binding-source-of-truth` and
  `design-system-is-centralized` (the console is designed in Figma first, composed from the
  kit), `settings-are-schema-driven-from-one-registry` and `unified-action-plane` (lifecycle
  verbs are `ActionDescriptor`s, not bespoke handlers).

## Constraints

- **No rag code change is a precondition.** The lifecycle correctness path (gate +
  re-discover + attach) must work against rag `0.2.25` as shipped. Coordination asks to rag
  are filed but never block dashboard delivery.
- **rag's Qdrant collection/payload shape is internal and unversioned.** The console must
  never depend on recomputing rag's blake2b collection naming or reading its payload layout;
  collection names are sourced from `/storage/survey`, and direct-Qdrant reads use only
  Qdrant's documented REST contract for the pinned Qdrant version (today `1.18.2`).
- **No HTTP repair surface exists.** `prune_orphaned()` is CLI-only; the only HTTP
  remediation is `reindex clean:true` (rebuild) + `projects/evict`. True repair
  (prune/optimize) is deferred behind a capability gate until rag exposes routes; brokering
  rag's machine-global CLI `prune` from the engine is the wrong layer and is rejected.
- **`/storage/survey` requires rag server mode** (409 otherwise); the console degrades that
  panel honestly in local-only mode.
- **No auto-supervision** (per the foundation ADR `D5` and rag's intent): no
  restart-on-crash, no two services, no speculative start. Auto-start-on-demand stays
  deferred until the lifecycle-correctness and console framing land.

## Implementation

**D1 — One shared machine-global "running" predicate.** A single predicate, evaluated
machine-globally (never per-scope status file): (1) discover `~/.vaultspec-rag/service.json`;
(2) heartbeat fresh (one threshold, aligned with rag's own staleness model); (3) confirm
`GET /health` `status=="ready"` + live `pid`. RUNNING requires all three; a genuine miss is
ABSENT; a discovered-but-stale/contradicted service is CRASHED (surfaced distinctly, treated
as absent for start purposes). This predicate is the authoritative "a service exists on this
machine" signal and is documented once, mutually referenced by both repos.

**D2 — Gate `server start`; re-discover and attach.** The lifecycle runner never calls
`server start` speculatively — it gates on the D1 predicate returning genuinely-absent. On a
start that returns exit 1 (already-running / machine-owned) OR exit 0 ("already running"),
the runner re-runs the predicate and ATTACHES, surfacing success ("attached to the machine
service"), never an error. No stdout parsing. The engine lifecycle runner stops mapping
already-running to `HTTP 502`.

**D3 — Discovery invariant.** Committed in writing: rag is machine-global at
`~/.vaultspec-rag/service.json`; the dashboard does NOT override `VAULTSPEC_RAG_STATUS_DIR`
and the lifecycle subprocess spawn does not introduce it. The machine-global candidate wins
over any per-scope candidate. If per-scope isolation is ever required, discovery switches to a
STATUS_DIR-independent source (the lock-holder pid) — coordinated with rag first.

**D4 — Bounded, validated arg pass-through.** The rag verb whitelist forwards a small,
validated, bounded set of `server start` flags — `--local-only`, `--port`,
`--qdrant-auto-provision` — and chains a `needs_install` outcome to `server qdrant install`.
Args are validated at the engine boundary (bounded enum/int), never free-form.

**D5 — A paired Rust diagnostics/size/state backend.** New engine projections aggregate
rag's Tier-1 HTTP into a bounded, memoized rag-ops state surface served to the stores layer:
per-tenant counts + disk footprint (`/service-state` + `/storage/survey`), job history
(`/jobs`), tenants (`/projects`), GPU/pool metrics (`/metrics`), readiness, and the
machine-level service identity (`/health`). Tier-2 Qdrant-native reads (optimizer status,
segments, indexed-vs-total) are capability-gated on the Qdrant version, using collection
names from `/storage/survey`. Aggregation is bounded and memoized; spawns/HTTP carry
cap+timeout.

**D6 — Capability-gated direct-Qdrant + repair edges.** The embeddings direct-scroll and the
Tier-2 health reads are gated on a `/health`/`/readiness` capability+version check and degrade
the affected panel/tier honestly on mismatch. Repair ships what HTTP allows today (clean
rebuild via `reindex`, `evict`, orphan-namespace surfacing via `/storage/survey`); true repair
(prune/optimize) is a disabled-with-honest-reason affordance gated on a rag capability flag.

**D7 — The rag operations console (UI).** A dedicated host-level surface, designed in Figma
first and composed from the kit, visually/semantically distinct from per-scope
index/watcher/search. It presents: a machine-level lifecycle control (start-when-absent /
stop / restart / doctor / install / status) with copy stating stop is machine-wide and
affects all consumers; a per-tenant data-management section (reindex, clean rebuild, evict,
watcher); and a diagnostics section (size/state, jobs, storage survey + orphans,
quality/benchmark). Lifecycle verbs are `ActionDescriptor`s on the unified action plane;
the surface consumes stores hooks only.

**D8 — Coordination asks to rag (filed, non-blocking).** HTTP `prune`/`optimize` repair
routes; a `contract_version`/`schema_version` on `/health`; optionally a `server start --json`
that exits 0 with `{"status":"already_running", pid, port}` and a STATUS_DIR-independent
machine pointer. These remove future parsing/recompute burden but are not preconditions.

## Rationale

The research established that the dashboard's drift is in the lifecycle path, not the control
plane, and that the brief's central D1 remedy was infeasible as written (no JSON from
`server start`) — so the robust, rag-change-free fix is gate-then-re-discover-and-attach,
which the §4 predicate makes deterministic. The three-tier contract framing is forced by the
uncodified-schema finding: depending on rag's internal Qdrant shape would re-create exactly
the silent-break class `D6` warns about, whereas Tier-1 HTTP + Tier-2 Qdrant-native (pinned,
capability-gated) gives a stable surface for the console while keeping the genuinely-missing
repair/version pieces as honest, filed coordination asks rather than reverse-engineered
guesses. Owning size/state aggregation in Rust honors the owner's performance directive and
`dashboard-layer-ownership` (the engine infers, stores is the sole wire client, the console is
glass). Machine-scoped framing closes the D2 footgun (an operator "stopping this workspace's
rag" silently stopping every consumer's).

## Consequences

- **Gains:** the dashboard becomes a correct, co-equal manager of the one machine rag —
  attaching to a running service with zero start attempts and zero error envelopes, starting
  exactly one when absent, and never producing two services or a 502-for-the-loser under a
  race. Operators get a real, machine-honest operations console with performant size/state.
- **Honest difficulties:** repair is partial until rag ships HTTP routes (the console must
  state this, not fake it); Tier-2 Qdrant reads are pinned to a Qdrant version and must
  degrade on drift; `/storage/survey` is server-mode only. The new UI is a sizeable surface
  that needs a Figma design pass before build.
- **Pitfalls avoided:** no auto-supervision; no engine-side rag semantics; no dependency on
  rag's internal collection/payload shape; no per-scope STATUS_DIR override.
- **Pathways opened:** once rag ships a `contract_version` and HTTP repair routes, the
  capability-gated affordances light up with no dashboard re-architecture.

## Codification candidates

- **Rule slug:** `rag-is-a-machine-singleton-the-dashboard-attaches-never-owns`.
  **Rule:** rag is one resident service per machine (authority = the OS machine lock); the
  dashboard determines "running" from machine-global discovery + heartbeat + `GET /health`,
  manages whatever service is running regardless of who started it, and starts its own only
  when one is genuinely absent — never speculatively, never per-workspace, attaching (not
  erroring) on an already-running race.
- **Rule slug:** `rag-data-rides-the-codified-contract-not-the-qdrant-shape`.
  **Rule:** rag size/state/data/diagnostics are read from rag's HTTP control plane (Tier 1)
  or, only for what rag does not expose, from Qdrant's own documented REST API
  capability-gated on the Qdrant version using collection names from `/storage/survey`
  (Tier 2); never from rag's internal, unversioned collection-naming or payload shape, and a
  capability/version mismatch degrades honestly.
- **Rule slug:** `dashboard-does-not-override-rag-status-dir`.
  **Rule:** the dashboard never sets/overrides `VAULTSPEC_RAG_STATUS_DIR` (or otherwise
  fragments rag discovery off the machine-global `~/.vaultspec-rag/service.json`); per-scope
  isolation, if ever needed, switches to a STATUS_DIR-independent machine pointer coordinated
  with rag first.
