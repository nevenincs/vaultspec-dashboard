---
tags:
  - '#research'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - '[[2026-07-04-dashboard-packaging-adr]]'
  - '[[2026-06-12-dashboard-foundation-adr]]'
  - '[[2026-07-07-project-provisioning-adr]]'
  - '[[2026-07-03-rag-integration-hardening-adr]]'
---

# `single-app-runtime` research: `the principal binary as the application — double-click launch, single-instance law, lifecycle ownership`

Review of what stands between the current `vaultspec` binary and a modern
single-application posture: one CLI-capable principal binary that IS the
application — it manages the backend engine, the served frontend, runtime
lifecycle, and provisioning, enforces a single-seat design (no second
instance), and, from the user's perspective, opens like an app when
double-clicked. The packaging campaign already delivered the artifact; this
research maps the *runtime* gaps and the hardening riders.

## Findings

### F1 — The delivered substrate is already most of a single application

The dashboard-packaging ADR (accepted, shipped v0.1.1/v0.1.2) delivered:

- **One binary, two front doors** (foundation D1.1): one-shot CLI verbs
  (`map`, `index`, `graph`, `node`, `events`, `status`) plus resident
  `serve` — `engine/crates/vaultspec-cli/src/main.rs`.
- **Embedded frontend**: `frontend/dist` compiles into the binary via
  `rust-embed` behind the `embed-spa` feature; resolution chain embedded →
  `VAULTSPEC_SPA_DIR` → disk passthrough → placeholder
  (`engine/crates/vaultspec-api/src/routes/spa.rs:22-81`).
- **Release pipeline**: `dist` + release-please, GitHub Releases, scoop /
  binstall channels live; winget PR pending (distribution-channels plan).
- **A product-shaped startup contract** (`vaultspec-api/src/lib.rs:299-497`):
  loopback-only bind with fail-loud port conflict (`--port 0` supported for
  tests), 128-bit CSPRNG bearer token (`app.rs:1611`), per-workspace
  discovery file `service.json` `{port, service_token, pid, last_heartbeat}`
  with a 15 s heartbeat, chmod 0600 on unix (`app.rs:1564-1586`), a crash-log
  panic hook (`lib.rs:366-386`), and a detect-and-instruct startup gate that
  WARNs with exact remediation and serves degraded through honest `tiers`
  (`lib.rs:353-364`, packaging D3 as amended 2026-07-07).
- **A provisioning plane**: `/provision/*` (project-provisioning ADR) serves
  a status projection plus job-shaped install/upgrade/migrate/uv-acquire
  brokers — the engine can already provision `vaultspec-core` for a project.
- **Security headers**: nosniff / X-Frame-Options DENY / no-referrer
  (`lib.rs:280-293`). CSP is explicitly deferred in a source comment.

Conclusion: the artifact and the wire are application-grade. What is missing
is the **application runtime shell around `serve`** — the front door,
instance law, and lifecycle verbs.

### F2 — Gap: no single-instance enforcement (the stated "single seat" law does not exist yet)

- `write_service_json` unconditionally overwrites the workspace's
  `service.json` (`app.rs:1564`). A second `vaultspec serve` in the same
  workspace on a different port binds successfully and the two heartbeats
  **clobber each other's discovery file** — both run, discovery flaps
  between them. The fail-loud port conflict only catches the same-port case.
- There is no OS-level lock, no pid-liveness takeover protocol, and no
  "already running → attach" behavior on the serve path.
- Contrast: `vaultspec-rag` is governed as a **machine singleton under an OS
  machine lock** with discovery + heartbeat freshness + `/health` as the
  running-predicate (rag-integration rule) — the exact pattern the engine
  itself does not apply to itself. The engine's own code already *consumes*
  that predicate for rag (`routes/stream.rs:29`, `routes/query.rs:1041`).
- Decision space: per-workspace singleton (one serve per workspace, many
  workspaces allowed) vs machine singleton (one serve, period). The
  workspace registry model (multi-root, F3) favors **machine-singleton with
  multi-workspace registry inside one process** as the "single seat";
  per-workspace lock is the minimal fallback.

### F3 — Gap: no application front door; double-click cannot work today

- Bare `vaultspec` (no subcommand) is a clap usage error — there is no
  default verb (`main.rs:39-96`).
- No browser launch anywhere in the workspace (no `open`/`webbrowser`
  dependency in any engine crate).
- `serve` **requires** its cwd (or `--scope`) to resolve inside a
  git workspace containing `.vault` (`lib.rs:322-351`); a double-clicked
  binary's cwd is arbitrary (Explorer gives the exe's directory), so today a
  double-click prints help or fails workspace discovery and exits.
- **No machine-global workspace registry**: `UserState::open` is scoped to
  one workspace's `.vault` (`vaultspec-session/src/lib.rs:67`);
  `auto_register_launch` and `registry_roots` live inside that per-workspace
  store. A cwd-less launch has no way to enumerate known workspaces or find
  the last-active one. rag's `~/.vaultspec-rag/` home-dir discovery is the
  in-house precedent for machine-global state.
- **Windows subsystem question**: the binary is a console-subsystem exe.
  Double-click opens a console window alongside the browser. Options:
  (a) accept the console window (simplest, honest logs, zero risk to CLI);
  (b) `windows_subsystem = "windows"` + `AttachConsole(ATTACH_PARENT_PROCESS)`
  for CLI output (known-lossy: no piping/redirection guarantees, breaks
  `--json` consumers); (c) a second tiny GUI-subsystem launcher exe that
  spawns the console binary detached (two artifacts again); (d) Tauri shell
  — already explicitly deferred to v3 by the packaging ADR. The packaging
  ADR's install channels (scoop/winget/MSI) can create Start-Menu shortcuts
  that launch with a flag, which softens (a).

### F4 — Gap: lifecycle is start-only; nothing owns stop, restart, or staleness

- No graceful shutdown: `axum::serve(...)` without
  `with_graceful_shutdown`, no `tokio::signal::ctrl_c` handler
  (`lib.rs:494-497`). Ctrl-C aborts mid-write; SSE clients get RST; the
  stale `service.json` (with dead pid) is left behind and only heartbeat
  age reveals death.
- No `stop` / `restart` / service-aware `status` verbs; no ungated shutdown
  or self-identification endpoint for a second invocation to coordinate
  with (health exists ungated; shutdown would need bearer or pid-owner
  check).
- No stale-discovery cleanup on clean exit (the file should be removed or
  tombstoned).
- Self-update (axoupdater, receipt-gated) has no coordination with a
  running instance — updating while serving swaps the binary under a live
  process; an explicit "stop → update → relaunch" flow is undesigned.
- The heartbeat task holds the whole `AppState` alive and is abort-on-drop
  guarded (`lib.rs:475-489`) — good bones for a supervised lifecycle.

### F5 — Provisioning: served plane exists; CLI parity is the gap

- The engine serves `/provision/*` (status projection + install / upgrade /
  migrate / uv-acquire job brokers) and the startup gate probes `git` and
  `vaultspec-core >=0.1.36`, WARN-degraded.
- The CLI has **no provisioning verbs** — a terminal user cannot ask the
  principal binary to provision/repair a project or check companion floors
  except by launching the GUI. CLI parity (`vaultspec provision status`,
  `vaultspec provision install`, one-shot over the same broker code) makes
  the binary the single management surface the goal statement asks for.
- Boundary law reaffirmed: rag stays attach-never-own (machine lock is
  rag's, `STATUS_DIR` never overridden); `vaultspec-core` stays a versioned
  subprocess dependency, provisioned but not lifecycle-owned.

### F6 — External patterns (cohort + crates)

- Local-web-app cohort (Syncthing, Jupyter, Livebook, code-server) converge
  on the same default-verb shape: **ensure-running (attach if a live
  instance exists, else start) → open browser at a tokenized localhost
  URL**; single-instance via lock file/OS mutex; localhost token auth —
  exactly the contract `service.json` already carries.
- Crates (to be version-pinned at ADR/code-research time): `open` (browser
  launch, actively maintained, no service deps) or the `webbrowser` crate;
  single-instance via `fd-lock`/`named-lock` (Windows named mutex + unix
  flock under one API); graceful shutdown is first-party axum
  (`with_graceful_shutdown` + `tokio::signal`). All are small,
  no-new-runtime additions consistent with resource-bounds.
- Windows dual-subsystem is the one genuinely thorny area (F3); the cohort
  answer is almost universally "stay console-subsystem, let the installer
  create a windowless shortcut/service" rather than dual-mode binaries.

### F7 — Hardening riders surfaced by this review

- CSP deferred by comment (`lib.rs:280`) — belongs in this hardening pass,
  gated on testing against the embedded SPA's inline needs.
- `service.json` clobber race (F2) doubles as a correctness bug even before
  the instance law lands.
- Crash visibility exists (crash log) but there is no crash-loop guard or
  supervisor semantics if a launcher relaunches on failure.
- The startup gate and `/provision` probe overlap; a single-app runtime
  should route both through one probe module so CLI, startup WARN, and the
  served projection cannot disagree.

### Decision space handed to the ADR

- D-space 1: **Default verb** — bare `vaultspec` (and double-click) becomes
  app-launch: resolve workspace → ensure single instance (attach or start)
  → open browser with tokenized URL; `vaultspec serve` remains the explicit
  foreground verb.
- D-space 2: **Instance law** — machine-singleton vs per-workspace
  singleton; lock mechanism; takeover protocol for dead-pid staleness.
- D-space 3: **Machine-global workspace registry** under a home-dir root
  (rag precedent) recording known workspaces + last-active, feeding cwd-less
  launches; picker behavior when ambiguous or empty (first-run onboarding).
- D-space 4: **Lifecycle verbs + graceful shutdown** — `stop`, `restart`,
  service-aware `status`; signal handling; discovery cleanup on exit;
  update-coordination with a running instance.
- D-space 5: **Windows double-click ergonomics** — subsystem decision plus
  installer shortcuts; explicitly scoped so it cannot degrade CLI/`--json`.
- D-space 6: **CLI provisioning parity** over the existing `/provision`
  broker; one shared probe module for startup gate, CLI, and served
  projection.
- D-space 7: **Hardening riders** — CSP, service.json race, crash-loop
  guard.

### Sources

- `engine/crates/vaultspec-cli/src/main.rs` (verb surface, no default verb)
- `engine/crates/vaultspec-api/src/lib.rs:280-497` (serve lifecycle, headers,
  startup gate, heartbeat, no graceful shutdown)
- `engine/crates/vaultspec-api/src/app.rs:1552-1634` (service.json write,
  bearer generation, state build)
- `engine/crates/vaultspec-api/src/routes/spa.rs` (embed-spa chain)
- `engine/crates/vaultspec-session/src/lib.rs:67,180` (per-workspace user
  state, launch auto-registration)
- ADRs: dashboard-packaging (2026-07-04), dashboard-foundation (2026-06-12),
  project-provisioning (2026-07-07), rag-integration-hardening (2026-07-03)
- Cohort/crate references: axum graceful-shutdown example
  (`tokio.rs` axum repo `examples/graceful-shutdown`), `open` crate
  (crates.io/crates/open), `named-lock` (crates.io/crates/named-lock),
  Syncthing/Jupyter default-launch behavior (project docs).
