---
tags:
  - '#research'
  - '#project-provisioning'
date: '2026-07-07'
modified: '2026-07-12'
related: []
---

# `project-provisioning` research: `framework acquisition and provisioning backend`

Grounding for the feature gap: selecting an active project (a registered workspace root
or one of its worktrees) can land the operator in a genuinely empty, non-vaultspec-managed
repository. The dashboard today can only describe that state; it cannot act on it. The
goal is a backend the frontend can build on that acquires the ecosystem tools
(`vaultspec-core`, `vaultspec-rag`) and provisions the framework into a target project —
install, upgrade, force re-install, migrate — as explicit operator-invoked actions. This
research maps every prior decision and code seam that binds the design.

## Findings

### F1 — The empty-project state is already honestly detected, but dead-ends

- The workspace registry validates only git-ness on register: a root must resolve a git
  common dir and enumerate at least one worktree; vault presence is NOT a registration
  requirement (dashboard-workspace-registry ADR).
- `GET /map` marks each worktree `has_vault` (`.vault/` dir presence,
  `engine/crates/vaultspec-api/src/routes/query.rs`); non-vault scopes are filtered from
  vault-bearing listings and `validate_scope` 400s an unknown or non-vault scope honestly
  (`engine/crates/vaultspec-api/src/registry.rs`).
- Result: a registered-but-unmanaged project renders as an empty/degraded state with no
  affordance to fix it. The remediation knowledge exists only as startup-probe prose.

### F2 — Detect-and-instruct is the accepted acquisition posture; instruction is not yet actionable

- The dashboard-packaging ADR chose detect-and-instruct for the Python companions: at
  startup `vaultspec serve` probes `git` and `vaultspec-core` (floor `>=0.1.36`), warns
  loudly with the exact `uv tool install vaultspec-core` remediation string, and serves
  degraded (amended 2026-07-07 from fail-closed). rag stays attach-or-instruct
  (floor `>=0.2.28` when present). Bundled-uv first-run bootstrap was explicitly
  DEFERRED to v2; hard version lockstep was rejected in favor of the floor-declaring
  `tiers` handshake (`engine/crates/vaultspec-api/src/handshake.rs`).
- Probes are memoized per process lifetime (`OnceLock`) — a post-acquisition upgrade is
  invisible to the running handshake without a refresh path. Any provisioning backend
  must add re-probe/invalidation or the UI will report stale floors after a successful
  upgrade.
- uv itself is assumed present for remediation; nothing probes or installs uv. Offline /
  missing-uv remains an honest dead-end by decision (packaging ADR constraint).

### F3 — The CLI verbs to broker already exist, with a machine-readable contract

- `vaultspec-core install [PROVIDER] -t DIR` deploys the framework into a target
  directory (`PROVIDER` default `all`; `core` = `.vaultspec/` only), with `--upgrade`
  (re-sync builtins without re-scaffolding), `--force` (overwrite existing), `--dry-run`,
  `--skip`, `--json`. `vaultspec-core uninstall` exists and is destructive
  (requires `--force`, optional `--remove-vault`).
- Sync-shaped results (`install`, `sync`, `spec <resource> sync`, `migrations run`)
  share one vocabulary — `created`, `updated`, `unchanged`, `removed`, `restored`,
  `skipped`, `failed` — under `--json` schema `vaultspec.sync.v1` with an aggregate
  top-level `status` (`mixed` on disagreement). This is a served, renderable contract:
  the frontend can display outcomes without inventing semantics.
- `vaultspec-core migrations status` / `migrations run` cover schema migration of an
  already-managed project; `vaultspec-core spec doctor` and `vault check all` cover
  health verification post-provision.
- Machine-level acquisition is `uv tool install vaultspec-core` / `uv tool install
  vaultspec-rag` (and `--upgrade` variants) — a third sibling class: spawning `uv`,
  which the engine has never spawned.

### F4 — Engine boundary doctrine: broker the owning sibling, never write

- `engine-read-and-infer`: the engine never writes `.vault/`, never mutates git, and
  forwards only whitelisted sibling verbs verbatim through `/ops/*`
  (`engine/crates/vaultspec-api/src/routes/ops.rs`): `CORE_WHITELIST` (read),
  `CORE_WRITE_WHITELIST` (the editor save verbs — precedent that FORWARDING a write to
  the sibling that OWNS it is inside the fence), `RAG_CLI_WHITELIST` (lifecycle:
  `server-status`, `server-doctor`, `server-install`), and
  `RAG_STORAGE_CLI_WHITELIST` (destructive storage verbs with a dry-run/apply gate and
  a generous-but-bounded 300s budget).
- The fenced authoring module's core adapter
  (`engine/crates/vaultspec-api/src/authoring/core_adapter.rs`) is the strongest
  precedent for engine-invoked MUTATING core verbs: a typed capability enum with
  deliberately NO wire-string-to-verb path, project-pinned resolution via
  `ingest_core::runner::CoreRunner::detect` (prefers the uv-managed core), every spawn
  carrying BOTH an output cap and a wall-clock timeout, process-group kill on Unix,
  outcome-indeterminate breach semantics on Windows, and wire-redacted errors.
- The workspace-registry ADR explicitly fenced registration as config-not-content and
  named the standing risk: "register a project" must never grow into "clone / init /
  create a worktree". Provisioning therefore CANNOT ride the registration path — it must
  be a separate, explicit plane, leaving registration read-only.

### F5 — rag enrollment is already solved; only tool acquisition is missing

- rag is a machine singleton the dashboard attaches to and never owns
  (rag-service-management ADR D1–D3): running-predicate discovery, gate-then-attach
  start, no `VAULTSPEC_RAG_STATUS_DIR` override. Per-project enrollment (register,
  reindex, watcher) is the existing HTTP control plane; the `needs_install` chain for a
  missing managed Qdrant already surfaces `server qdrant install` through the broker.
- What is missing for rag is only the machine-level tool acquisition/upgrade
  (`uv tool install vaultspec-rag`) and its floor re-probe.

### F6 — Long operations, wire honesty, and frontend seams

- `uv tool install vaultspec-rag` downloads torch — multi-minute, multi-GB. A blocking
  HTTP verb under a fixed timeout is the wrong shape; rag's reindex precedent is
  job-based (trigger returns a job id, polled). Resource-bounds requires every
  accumulator bounded and every spawn cap+timed regardless.
- Wire contract: every response carries `tiers`; displayed/filterable state is
  backend-served, never frontend-derived — so "is this project managed / installable /
  migratable / enrollable" must be a served projection, not client inference over `/map`.
- Frontend: stores is the sole wire client; provisioning controls are
  `ActionDescriptor`s on the unified action plane; settings ride the schema registry;
  tests exercise the live wire over the fixture vault.
- One session-memory caveat worth carrying: rag's own installer has re-added a runtime
  torch dependency to a host project's `pyproject.toml` before — a reason to keep v1
  acquisition at the `uv tool` (machine) level and NOT run project-venv `uv add` flows.

### F7 — Options space (evaluated in the ADR)

- Where the plane lives: grow the existing `/ops/*` whitelists vs. a dedicated
  provisioning route family + fenced module (authoring-style).
- Execution shape: synchronous bounded verbs vs. job-shaped runs with polled progress.
- Scope of v1: project-level install/upgrade/migrate only vs. also machine-level tool
  acquisition via `uv` vs. also uv-project-level dependency management (rejected-leaning
  per F6 caveat).
- Trigger posture: operator-invoked only vs. auto-provision-on-select (contradicts the
  registry fence and the packaging ADR's no-speculative-start doctrine).
