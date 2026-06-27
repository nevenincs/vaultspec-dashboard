---
tags:
  - '#research'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
related:
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

# `rag-service-management` research: `rag single-machine multi-tenant service alignment`

vaultspec-rag hardened (shipped `0.2.24`, audited at `0.2.25`) into an explicit
**single-resident-service-per-machine, multi-tenant** architecture: one process owns the
GPU and the managed Qdrant and serves every project as a tenant, enforced by an OS
advisory lock. The rag team handed the dashboard a cross-project audit naming six drifts
(`D1`–`D6`) where the dashboard still treats rag lifecycle as something it owns per
workspace. This research grounds that brief against the dashboard's CURRENT engine/stores
code and against rag's real `0.2.25` source, so the decision record can target the real
contract rather than the brief's prose. The worktree was upgraded to the published
baseline first (`vaultspec-core 0.1.34`, `vaultspec-rag 0.2.25`) so the alignment is built
against the version it must satisfy.

The headline: the dashboard already brokers rag's HTTP control plane correctly as a
multi-tenant consumer (every `reindex`/`watcher`/`projects`/`search` verb carries
`project_root`). The drifts are concentrated in the **service-lifecycle** path — starting,
the running-predicate, the UI framing of stop, argument pass-through, and the direct-Qdrant
embedding read.

## The rag `0.2.25` model (grounded against rag source)

- **The machine lock is the authority.** `_machine_lock.py` holds an OS advisory lock
  (`fcntl.flock` POSIX / `msvcrt.locking` at a 1 MiB byte offset on Windows) on
  `service.lock`, which lives beside the machine-global managed Qdrant storage
  (`~/.vaultspec-rag/qdrant-server/service.lock`) — NOT under the status dir. The lock,
  not file existence or a PID file, decides "one service per machine," and the OS releases
  it automatically on crash (no stale-lock race; `release_machine_lock` deliberately does
  not unlink). rag's own comment anticipates "the dashboard's project-local case": the lock
  stays machine-wide even when `VAULTSPEC_RAG_STATUS_DIR` is overridden. A side-effect-free
  `machine_lock_live_holder()` returns the holder pid or 0.
- **`server start` refuses a second service in a fixed order.** Guard 1: port not bindable
  → `exit 1`. Guard 2: a live machine-lock holder on any port/status-dir → `exit 1` (the
  human message carries the holder pid). Guard 3: only then the idempotent
  `_existing_service_running()` path, which prints "Service already running" and returns
  `exit 0`.
- **`server start` emits NO JSON.** It has no `--json` flag; every path prints human Rich
  text to stdout. This is the load-bearing correction to the brief (see `D1` below).
- **`server status` exit codes:** `0` running, `3` stopped (no `service.json` in this
  config's status dir), `4` any `crashed_*` (service.json present but a signal contradicts).
  It reports THIS config's recorded service and deliberately does NOT probe the shared port
  (to avoid misreporting another project's healthy service as this config's orphan).
- **Discovery is `service.json`.** Written to `<status_dir>/service.json`, default
  `~/.vaultspec-rag/service.json`, **but the status dir honors `VAULTSPEC_RAG_STATUS_DIR`**.
  Fields include `pid`, `port`, `service_token`, `started_at`, `last_heartbeat`,
  `heartbeat_interval_s` (15), `stale_after_s` (60), and `qdrant_port` (the Qdrant HTTP
  port — the brief's `storage_port` is the wrong field name). Heartbeat ticks every 15s;
  rag declares its own service crashed at 60s of staleness.
- **`/health` is the authoritative liveness signal, and it is ungated.** It returns
  `status` (`"ready"`/`"degraded"`/`"error"`), `pid`, `models_loaded`, `project_count`,
  `backend_capabilities`, and a nested `qdrant` object carrying `version`, `port`, `alive`.
  There is no top-level `version`/`storage_port`; they live at `qdrant.version` /
  `qdrant.port`.
- **Projects are tenants.** A shared `ServiceRegistry` holds one embedding model and a
  per-`project_root` `ProjectSlot` with refcounted leases, an LRU `max_projects` cap, and
  idle-TTL eviction. `/projects` reports the registry; every control verb resolves
  `project_root` or returns `400`.

## Drift verification (against the dashboard's current code)

**`D1` — start failure ≠ "service down". VERIFIED, with a corrected fix.** The lifecycle
runner `run_sibling_bounded_in_dir` (`engine/crates/vaultspec-api/src/routes/ops.rs`
~`202-211`) maps ANY non-zero exit to `HTTP 502` and discards the buffered stdout. The
write runner `run_sibling_write_bounded` (~`331-355`) already does the right thing for
writes: it inspects stdout for a JSON `status` envelope FIRST and forwards the business
outcome regardless of exit code, only 502-ing when there is no parseable envelope AND a
non-zero exit. The brief proposed cloning that stdout-inspection onto the lifecycle path —
but rag's `server start` emits **no JSON**, so there is nothing to parse. The robust fix is
therefore **not** stdout parsing: it is to never call `server start` speculatively, gate it
on the §4 running-predicate, and on an `exit 1` (already-running / machine-owned)
**re-discover and attach** rather than surface an error. An `exit 0` "Service already
running" is likewise success.

**`D2` — lifecycle is machine-global but modelled per-scope. VERIFIED.** The engine
whitelist spawns bare `server stop` (machine-global kill) and the frontend exposes
`rag:server-start` / `rag:server-stop` (`frontend/src/stores/server/opsActions.ts` ~`53-59`)
and unconditional `"ops: start rag"` / `"ops: stop rag"` palette commands
(`opsCommandProvider.ts`) with no machine-level framing or copy. Nuance: NO React component
currently renders the rag controls — a stores-layer `opsPanel` view exists
(`stores/view/opsPanel.ts`) but is mounted nowhere; the live surface is the command palette.
So "the lifecycle UI" today is effectively the palette plus an unmounted view.

**`D3` — discovery is machine-global only by accident. PARTIALLY-TRUE (latent).**
`rag_client::client::service_json_candidates` (`engine/crates/rag-client/src/client.rs`
~`42-53`) checks a **per-scope** candidate first (`<vault_root>/data/search-data/service.json`)
then the machine-global `~/.vaultspec-rag/service.json`, taking the first readable+fresh one.
The lifecycle subprocess spawn does not `env_clear`, so rag inherits the engine's env and —
critically — `VAULTSPEC_RAG_STATUS_DIR` is set nowhere in this repo (grep-confirmed zero
references). So discovery lands on the machine-global path today, correctly but
incidentally: the moment anyone sets `VAULTSPEC_RAG_STATUS_DIR` per scope (the natural
multi-workspace instinct), `service.json` fragments while the machine lock still allows one
service → losers fail discovery. Two latent hazards: the per-scope candidate is preferred
over the machine-global one, and there is no committed invariant forbidding STATUS_DIR
override.

**`D4` — "running" must be machine-global discovery + `/health`. STALE framing, real gap.**
The dashboard does NOT misuse `server status` exit-3 anywhere: `server-status` is whitelisted
but never auto-called. Running-state is derived from `discover()` (service.json +
heartbeat-staleness) surfaced through `/status` (`routes/stream.rs` ~`28-33`), the per-tier
`tiers` block (`routes/mod.rs` ~`28-34`), and `adaptStatus` →
`rag.available ? "running" : "stopped"` (`liveAdapters.ts` ~`721-724`). The real gap the
brief names survives: discovery trusts a fresh heartbeat and never probes `/health`, so a
service that crashed within the staleness window (and the dashboard's window is a lenient
120 ms-keyed **120s** `HEARTBEAT_STALE_MS`, vs rag's own 60s) reads "available" until the
heartbeat goes stale. Adding a `/health` liveness confirm closes it and lets the dashboard
distinguish "crashed" from "absent."

**`D5` — no argument pass-through. VERIFIED.** `RAG_CLI_WHITELIST` (`routes/ops.rs` ~`86-92`)
hard-codes fixed arg slices (`server-start` → `["server","start"]`); the lifecycle dispatch
ignores the request body entirely, so `--local-only`, `--port`, and
`--qdrant-auto-provision` cannot be selected. On CI/offline/air-gapped hosts (where
local-only is the only workable backend) the dashboard cannot start rag correctly, and a
first run on a host missing the Qdrant binary fails opaquely into the 502.

**`D6` — direct-Qdrant embedding read is a second unversioned contract. VERIFIED.** The
embeddings path scrolls Qdrant directly over its loopback HTTP port
(`info.qdrant_port()` from `service.json`, `routes/query.rs` ~`752-760` → `vectors.rs`
~`183`) with no `/version` or capability preflight. The code comments mark this as the
intended canonical seam (foundation ADR `D1`), and a collection/shape mismatch degrades the
semantic tier via a Qdrant `404` rather than crashing — but a rag-side Qdrant port or
collection-shape change breaks embeddings independently of the version-tolerant HTTP fence.
Gating the scroll behind a `/health` `qdrant.version`/`qdrant.port` capability check (and
degrading honestly on mismatch) removes the silent-break.

## What is already correct (do not disturb)

- The HTTP control plane is brokered as a proper multi-tenant consumer: GET
  `service-state`/`jobs`/`watcher`/`projects`/`readiness`/`logs`/`metrics` and POST
  `reindex`/`watcher-*`/`project-evict`/`quality`, each carrying `project_root`
  (`routes/ops.rs` ~`1330-1416`). Unavailable rag degrades to a `200` with a degraded tier,
  never a `5xx` — consistent with `every-wire-response-carries-the-tiers-block` and
  `degradation-is-read-from-tiers-not-guessed-from-errors`.
- `rag-client` already deserializes the Qdrant port from both `qdrant_port` and the
  `storage_port` alias, so the field-name correction needs no code change there.
- The engine stays read-and-infer: no rag semantics leak in; the lifecycle path only
  forwards whitelisted verbs. The alignment must preserve this (`engine-read-and-infer`).

## The operations surface and the storage-schema gap

The expanded goal is a real **rag operations console** — a UI plus a paired Rust backend
that exercises rag's lifecycle, per-tenant data management + repair, and diagnostics (with
size/state computed performantly in Rust). The load-bearing constraint is that **rag's
Qdrant collection/payload/storage shape is NOT a codified contract** — it is internal
Python (`store.py`: the `root_collection_prefix` blake2b naming, the named-vector `dense`
+ payload field layout), exported in `__all__` but never over HTTP and never versioned.
That gap does not block the console; it dictates which contract each feature is built on.
Three tiers, by contract stability:

**Tier 1 — rag's HTTP control plane (codified, version-tolerant; build freely in Rust).**
Most of "size and state" rides this and never touches the Qdrant shape:
- `GET /service-state?project_root=` — the consolidated per-project snapshot: `index`
  (`vault_count`/`code_count` doc counts, GPU `vram_mb`, `storage_path`,
  `backend_capabilities`), `projects` (tenant registry), `watcher` (enabled/running/debounce),
  `qdrant` (`mode`/`pid`/`alive`/`port`/`version`/`restarts`). This is the primary state +
  counts source.
- `GET /storage/survey` — per-namespace **bytes-on-disk** (filesystem walk),
  **points count**, the collection names, and a `status` of `live`/`orphaned`/`unknown`/
  `unverifiable` per namespace (server mode only). This is the disk-size and
  orphan-detection source — and it hands us collection names so we never recompute rag's
  blake2b.
- `GET /jobs` — rich job history + live progress (bounded 256-record ring): phase, source,
  trigger, initiator, progress step/completed/total, RSS/CUDA resources, runtime seconds.
- `GET /projects` (leased tenants, ref_count, idle), `GET /metrics` (search/reindex
  counters, GPU memory, pool tokens), `GET /watcher`, `GET /readiness` (per-dependency:
  torch/models/qdrant, carries the Qdrant binary version), `GET /health` (ungated:
  `status=="ready"`, `pid`, nested `qdrant`, `service_token`, `backend_capabilities`,
  `project_count`, `uptime_s`).
- Controls: `POST /reindex` (`clean:true` = drop+recreate full rebuild), `POST /projects/evict`,
  `POST /quality` (8-probe embedding-quality check), `POST /benchmark` (latency p50/p95/p99),
  `POST /watcher/{start,stop,reconfigure}`.

**Tier 2 — Qdrant's OWN documented HTTP API (semi-stable; capability-gated).** The
operational health that actually signals "needs repair" — `status` (green/yellow/red),
`optimizer_status`, `segments_count` (fragmentation proxy), `indexed_vectors_count` vs
`points_count` (reindex-in-progress) — is exposed only by Qdrant, not rag. The dashboard
can read Qdrant's documented `GET /collections/{name}` directly on `qdrant_port`, using a
collection name sourced from `/storage/survey` (NOT recomputed), gated on the Qdrant
version read from `/readiness`/`/health` (`qdrant.version`, today `1.18.2`), degrading
honestly on mismatch. This is the existing D6 direct-scroll discipline generalized: depend
on Qdrant's stable REST contract for a pinned version, never on rag's internal payload shape.

**Tier 3 — genuine gaps that REQUIRE rag coordination (cannot be built unilaterally).**
- **Repair is mostly absent over HTTP.** There is NO `prune`/`compact`/`optimize`/`vacuum`
  HTTP route. `prune_orphaned()` exists but is CLI-only; the only HTTP remediation is
  `reindex clean:true` (full rebuild) and `projects/evict`. So the console can ship
  rebuild + evict + orphan-detection (via `/storage/survey`) today, but true repair
  (prune orphaned namespaces, force-optimize) needs rag to expose HTTP routes — a
  coordination ask. Brokering rag's machine-global CLI `prune` from the engine is the
  wrong layer (storage-global, not project-safe) and violates `engine-read-and-infer`.
- **No rag package/contract/schema version in any HTTP response.** `/health` carries only
  the Qdrant binary version, `service_token`, and constant `backend_capabilities` (no
  version discriminator). Clean capability gating (Tier 2) wants a declared `contract_version` —
  another coordination ask. Until then, gating falls back to Qdrant version + capability
  presence.
- **No `last_indexed` timestamp** — inferred from the last `done` job's `finished_at` per
  project, or omitted.

The net effect on the design: the console is built on Tier 1 for size/state/lifecycle/data
(no schema dependency), reaches into Tier 2 only for repair-signalling health behind a
capability gate, and treats Tier 3 as explicit, filed coordination asks to rag — which is
why the posture is "self-contained where the HTTP contract suffices, coordinate to codify
the storage/repair contract," not purely one or the other.

## Implications for the decision record

1. **A single shared "running" predicate**, machine-globally, in this order: discover
   `service.json` → heartbeat fresh? → `GET /health` `status=="ready"` + live `pid` →
   RUNNING; only a genuine 1–3 miss is "absent." Crashed (stale/contradicted) is surfaced
   distinctly but treated as absent for start purposes. Both repos must reference one copy
   of this predicate.
2. **Gate `server start`; never speculative.** On `exit 1`/`exit 0` already-running,
   re-discover and attach — no stdout parsing (start emits no JSON).
3. **Machine-scoped lifecycle framing**, visually/semantically distinct from per-scope
   index/watcher/search, with copy stating stop is machine-wide and affects all consumers.
4. **A written discovery invariant**: rag is machine-global at `~/.vaultspec-rag/service.json`;
   the dashboard does not override `VAULTSPEC_RAG_STATUS_DIR`. If per-scope isolation is ever
   needed, switch discovery to a STATUS_DIR-independent source (the lock-holder pid) — coordinate
   with rag first.
5. **Bounded, validated arg pass-through** for `--local-only` / `--port` /
   `--qdrant-auto-provision`, with a `needs_install` → `server qdrant install` chain.
6. **Capability-gate the direct-Qdrant scroll** behind `/health` `qdrant.version`/`qdrant.port`.
7. **A paired Rust diagnostics/size/state backend.** New engine projections aggregate
   rag's Tier-1 HTTP (`/service-state`, `/storage/survey`, `/jobs`, `/metrics`, `/projects`,
   `/readiness`, `/health`) into a bounded, memoized rag-ops state surface served to the
   stores layer, plus capability-gated Tier-2 Qdrant-native reads for optimizer/segment
   health. Performance lives in Rust; the UI renders.
8. **A machine-level rag operations console (UI).** A dedicated host-level surface, distinct
   from per-scope index/watcher/search, covering lifecycle (machine-scoped, stop-is-global
   copy), per-tenant data management (reindex/clean-rebuild, evict, watcher), diagnostics
   (size/state, jobs, storage survey, orphan namespaces, quality/benchmark). Built Figma-first
   per `figma-is-the-binding-source-of-truth` and `design-system-is-centralized`.
9. **Repair edges, honestly scoped.** Ship what HTTP allows today (clean rebuild, evict,
   orphan surfacing); gate true repair (prune/optimize) behind a capability check that
   degrades honestly until rag exposes the routes.

**Resolved scope decisions (user-directed):** (a) UI scope = a dedicated host-level rag
operations console (not minimal palette reframing); (b) coordination posture = self-contained
on the gate+re-discover lifecycle path (no rag dependency to ship), while filing rag
coordination asks to codify the storage/repair contract — driven by the uncodified-schema
gap. Coordination asks to file: HTTP `prune`/`optimize` repair routes; a `contract_version`
(or `schema_version`) on `/health`; optionally the §6 `server start --json` idempotency
envelope and a STATUS_DIR-independent machine pointer.

## Sources

- The rag team's handover brief (cross-project service-management audit, rag `0.2.25`).
- rag `0.2.25` source: `_machine_lock.py`, `cli/_service_lifecycle.py`,
  `serviceclient/_discovery.py`, `server/_routes.py`, `server/_lifespan.py`,
  `server/_lifecycle.py`, `service.py`, `registry.py`.
- Dashboard engine/stores: `routes/ops.rs`, `routes/query.rs`, `routes/stream.rs`,
  `routes/mod.rs`, `rag-client/src/{client,control,vectors,search}.rs`,
  `stores/server/{opsActions,ragControl,liveAdapters,queries}.ts`,
  `stores/view/{opsPanel,commandProviders/opsCommandProvider}.ts`.
