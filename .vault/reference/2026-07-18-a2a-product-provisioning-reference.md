---
tags:
  - '#reference'
  - '#a2a-product-provisioning'
date: '2026-07-18'
modified: '2026-07-18'
related:
  - "[[2026-07-18-a2a-product-provisioning-research]]"
  - "[[2026-07-14-a2a-orchestration-edge-reference]]"
---

# `a2a-product-provisioning` reference: `distribution, lifecycle, and runtime closure`

## Summary

- **Snapshot:** Dashboard commit `63162dee`; A2A commit `db7400a`.
- **Product boundary:** The dashboard ships itself. Agent-to-Agent (A2A)
  remains an externally
  attached runtime with no product receipt, installer, lifecycle manager, or
  composite updater.
- **Closure gap:** Distribution, handshake, readiness, and frontend contracts
  cover dashboard core and retrieval-augmented generation (RAG) but do not
  model an installed A2A component.

### Dashboard distribution

- Cargo Dist 0.32 declares five targets for shell and PowerShell installation;
  Windows Installer (MSI) covers `x86_64-pc-windows-msvc`.
  `dist-workspace.toml:5-25`
- Release setup stages only the single-page application.
  `.github/release-build-setup.yml:5-24`
- Release jobs build artifacts while pull requests plan only.
  `.github/workflows/release.yml:41-181`
- WiX's only application file payload is the dashboard executable; it also
  creates PATH, shortcut, and registry components.
  `engine/crates/vaultspec-cli/wix/main.wxs:88-152`
  `engine/crates/vaultspec-cli/wix/main.wxs:155-189`
- Scoop extracts the target archive, including its documentation, and exposes
  only the executable through `bin`. `bucket/vaultspec.json:1-15`
- The updater delegates its installed application to the Cargo Dist
  `axoupdater` and exposes no composite-component update path.
  `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs:199-242`
- Real `dist plan` output lists the executable plus documentation in every
  target archive and only the executable as MSI application-file payload.
  Generated shell and PowerShell installers move declared binary and library
  lists only.
- Cargo Dist `include` adds unknown payloads to archives but not MSI. Custom
  WiX components and product-owned shell and PowerShell installation remain
  necessary.
- Release `v0.1.4` has no assets. No WinGet manifest exists.

### Dashboard provisioning

- Component acquisition covers Core and RAG; project provisioning separately
  brokers fixed Core provider and framework actions.
  `engine/crates/vaultspec-api/src/routes/provision.rs:59-245`
- Pruning stops when every retained job runs, so the registry can exceed its
  nominal cap. `engine/crates/vaultspec-api/src/routes/provision.rs:724-741`
- Conflict lookup and insertion occur under separate locks.
  `engine/crates/vaultspec-api/src/routes/provision.rs:925-956`
- Single-flight keys include the operation label, so install and upgrade can
  mutate one component concurrently.
  `engine/crates/vaultspec-api/src/routes/provision.rs:917-923`
- Application-home path authority and atomic writes, with `0600` enforcement on
  Unix, provide a partial state-file persistence precedent.
  `engine/crates/vaultspec-session/src/app_home.rs:28-49`
  `engine/crates/vaultspec-session/src/app_home.rs:85-100`

### Dashboard A2A edge

- `/ops/a2a` is an attach-never-own broker with five fixed verbs: `run-start`,
  `run-status`, `run-cancel`, `presets-list`, and `service-state`.
  `engine/crates/vaultspec-api/src/routes/ops/a2a.rs:1-56`
- Discovery accepts missing heartbeats, does not validate the parsed process ID
  (PID), and treats any successful `/health` response as attachable.
  `engine/crates/vaultspec-api/src/routes/ops/a2a.rs:166-251`
- Run start mints actor tokens before discovery and authenticated readiness.
  `engine/crates/vaultspec-api/src/routes/ops/a2a.rs:517-700`
- Streaming uses the same endpoint resolver.
  `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs:211-303`
- Handshake compatibility reports core and RAG only.
  `engine/crates/vaultspec-api/src/handshake.rs:1-44`
  `engine/crates/vaultspec-api/src/handshake.rs:195-218`
- Query envelopes do not seed the agent tier.
  `engine/crates/engine-query/src/envelope.rs:20-42`

### Dashboard frontend

- The A2A store treats an absent agent tier as healthy.
  `frontend/src/stores/server/agent/a2aTeam.ts:220-246`
- The client exposes run, cancel, presets, service-state, and streaming
  operations but no product lifecycle controls.
  `frontend/src/stores/server/agent/a2aTeam.ts:250-465`

### A2A package closure

- The package requires Python 3.13 and makes Torch and RAG production
  dependencies. Hatch targets the Python package tree for the wheel.
  `pyproject.toml:1-40` `pyproject.toml:76-77`
- A real wheel is 1,047,997 bytes with 447 entries, including 191 test-related
  archive entries. It omits `alembic.ini`, `package.json`, `node_modules`, and
  a package-local provider binary.
- File-backed startup always runs migrations.
  `src/vaultspec_a2a/database/session.py:170-180`
- Migration lookup requires external `project_root/alembic.ini`.
  `src/vaultspec_a2a/database/migrate.py:22-43`
- The default provider expects a repository-local Node Agent Client Protocol
  (ACP) adapter. The experimental binary backend expects a package directory
  that is absent.
  `src/vaultspec_a2a/providers/factory.py:22-37`
  `src/vaultspec_a2a/providers/factory.py:232-270`
- `package.json` pins ACP 0.59.0. `package.json:7`
- The clean installed gateway exits with code 3. Default provider creation
  raises `ConfigError`.

### A2A gateway and discovery

- The gateway lifespan owns database, checkpoint, aggregation, worker client,
  spawner, watchdog, discovery, and shutdown.
  `src/vaultspec_a2a/api/app.py:127-365`
- A live resident produces a warning but does not prevent another gateway.
  `src/vaultspec_a2a/api/app.py:251-266`
- The product default binds broadly. `src/vaultspec_a2a/control/config.py:222-244`
  `src/vaultspec_a2a/api/app.py:383-388`
- Discovery persists PID, port, heartbeat, and, when configured, the internal
  token. Its liveness predicate accepts any JSON-object Hypertext Transfer
  Protocol (HTTP) 200 response.
  `src/vaultspec_a2a/lifecycle/discovery.py:63-146`
  `src/vaultspec_a2a/lifecycle/discovery.py:205-264`
- `/v1` has no authentication dependency.
  `src/vaultspec_a2a/api/routes/gateway.py:71`
- Administrative shutdown is unauthenticated.
  `src/vaultspec_a2a/api/routes/admin.py:5-14`
- Top-level health can report ready while `/v1/service` reports degraded.
  `src/vaultspec_a2a/api/app.py:425-456`
  `src/vaultspec_a2a/control/health.py:229-326`
  `src/vaultspec_a2a/api/routes/gateway.py:773-836`

### A2A worker and provider processes

- The worker uses the gateway interpreter, and the spawner serializes startup.
  `src/vaultspec_a2a/control/worker_management.py:307-315`
  `src/vaultspec_a2a/control/worker_management.py:406-480`
- The gateway stops only a worker for which it retains a process handle.
  `src/vaultspec_a2a/control/worker_management.py:515-519`
- Boot reconciliation calls `ensure_worker` before it determines whether work
  exists. `src/vaultspec_a2a/control/dispatch.py:221-225`
- The standalone Model Context Protocol (MCP) adapter is independently
  invokable over standard input/output or streamable HTTP.
  `src/vaultspec_a2a/protocols/mcp/__main__.py:24-51`
- Authoring constructs a run-scoped server specification, while ACP subprocess
  creation and cleanup occur per model invocation.
  `src/vaultspec_a2a/providers/_acp_authoring.py:247-303`
  `src/vaultspec_a2a/providers/acp_chat_model.py:382-461`
  `src/vaultspec_a2a/providers/acp_chat_model.py:530-578`
- RAG resolves through mutable runtime `uvx`.
  `src/vaultspec_a2a/providers/_acp_mcp.py:32-59`

### Mutable state and lifecycle seams

- A2A home is separate from the repository, but database and workspace defaults
  still depend on launch context. `src/vaultspec_a2a/control/config.py:29-31`
  `src/vaultspec_a2a/control/config.py:69-76`
  `src/vaultspec_a2a/control/config.py:103`
  `src/vaultspec_a2a/control/config.py:113-123`
- SQLite snapshot and restore operations exist but are not connected to update.
  `src/vaultspec_a2a/control/db.py:104-188`
- The command-line interface (CLI) exposes gateway, run, workspace, and
  development-process verbs but no product install, repair, update, rollback,
  remove, or ownership contract.
  `src/vaultspec_a2a/cli/main.py:64-457`
