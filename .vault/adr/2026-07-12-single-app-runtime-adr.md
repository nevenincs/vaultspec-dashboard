---
tags:
  - '#adr'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - '[[2026-07-12-single-app-runtime-research]]'
  - '[[2026-07-04-dashboard-packaging-adr]]'
  - '[[2026-06-12-dashboard-foundation-adr]]'
  - '[[2026-07-07-project-provisioning-adr]]'
---

# `single-app-runtime` adr: `the principal binary as the application: seat law, default launch verb, lifecycle ownership` | (**status:** `accepted`)

## Problem Statement

The packaging campaign delivered an installable single binary with an
embedded SPA and a release pipeline, but the binary is still a *toolbox*,
not an *application*: bare `vaultspec` is a usage error, nothing launches a
browser, `serve` hard-requires a cwd inside a vaultspec-managed worktree
(a double-clicked exe has no useful cwd), two serves in one workspace
silently clobber each other's discovery file, nothing owns stop/restart or
graceful shutdown, and provisioning is reachable only through the GUI wire.
This ADR decides the application-runtime laws that make the principal
binary the de facto application: one seat per machine, a default launch
verb that behaves like opening an app, owned lifecycle, and CLI parity for
provisioning — while keeping every existing CLI verb first-class.

## Considerations

- Research F1: the substrate (embedded SPA, loopback + bearer contract,
  per-workspace `service.json` + heartbeat, detect-and-instruct startup
  gate, `/provision/*` broker, crash log) is delivered and stable.
- Research F2: no instance law exists; the same-workspace double-serve
  clobber is a live correctness bug. rag's machine-singleton
  (OS lock + discovery + heartbeat + `/health` running-predicate) is the
  in-house precedent the engine already consumes as a client.
- Research F3: the workspace registry already makes one process
  multi-workspace on the read side (`GET /workspaces`, `workspace=`
  params); the durable registry rows live in per-workspace user state, and
  no machine-global state exists for a cwd-less launch to consult.
- Research F4: `axum::serve` runs without graceful shutdown; Ctrl-C aborts
  mid-write and leaves stale discovery behind.
- The vitest live-engine harness and adverse suites spawn concurrent
  serves with `--port 0` (OS-ephemeral, the sanctioned exception in the
  dev-workflow ports rule); dev worktrees run parallel engines on the 87xx
  block. Any instance law must not break these.
- Tauri native shell stays deferred (packaging ADR v3 posture); the app
  experience is browser-opening, not a webview.
- Cohort pattern (Syncthing, Jupyter, code-server): default verb =
  ensure-running, attach if live, open browser at tokenized URL.
- No deprecation bridges: cutovers are full; new machine-global state is
  additive, not a mirror of retired state.

## Considered options

- **O1 Per-workspace singleton, one process per workspace — rejected as
  the end law.** Honest to today's boot, but "single seat" then means N
  processes across N workspaces contending for ports; the registry already
  points the other way. Kept only as the takeover unit inside O2.
- **O2 Machine-singleton seat with in-app workspace registry — CHOSEN.**
  One resident app process per machine (the seat), discovered and locked
  machine-globally (rag's pattern applied to ourselves); workspaces are
  registry entries inside the one app. Ephemeral-port serves are exempt so
  tests/dev keep spawning freely.
- **O3 Default verb runs serve in the foreground — rejected.** A
  double-click would pin an eternal console window; the cohort answer is
  spawn-detached + open browser + exit.
- **O4 Dual Windows subsystem (GUI exe or `windows_subsystem` +
  AttachConsole) — rejected.** Breaks `--json` piping guarantees or ships a
  second artifact; console-subsystem + detached spawn + installer
  shortcuts is the cohort answer and risks nothing CLI.
- **O5 Hoist per-workspace user state to a machine-global store —
  rejected.** Massive migration for no launch-path need; a small additive
  machine-global launcher state (known roots + last-active + seat
  discovery) is sufficient.
- **O6 Native folder-picker onboarding for a first-ever double-click —
  deferred.** v1 boots the seat workspace-less and lets the SPA's existing
  empty-state/provisioning surfaces register the first workspace by path;
  a native picker is a later nicety.

## Constraints

- **Seat exemption must stay airtight for tests/dev:** `--port 0` serves
  and an explicit `--no-seat` flag skip seat acquisition and machine
  discovery entirely (workspace-local `service.json` behavior unchanged
  there); otherwise CI concurrency and multi-worktree dev die. The
  exemption is declared at the flag site, mirroring the data-loading rule's
  sanctioned-exception style.
- **Workspace-less boot is a contract event for `serve`** (today it
  fail-louds without `.vault`): the boot must degrade to an honest
  "no workspace registered" state served through `tiers`, and the SPA
  empty-state must drive registration through the existing workspace
  registry write seam. Parent (workspace-registry ADR read surface) is
  stable; the write seam is the part to verify at plan time.
- **rag boundary unchanged:** the seat law is the engine's own; rag stays
  attach-never-own under its own machine lock, `STATUS_DIR` never
  overridden.
- **Zero-budget posture unchanged:** no signing, no service registration
  (no Windows service / launchd daemon); the seat is a user-session
  process.
- **New crates are small and pinned:** browser launch (`open`) and an OS
  lock primitive (`named-lock` or equivalent flock/named-mutex pair); both
  verified for maintenance at code-research time; no new async runtime.
- **Every accumulator/subprocess law binds:** the launcher's spawn carries
  the standard output cap + timeout posture; machine-global state files are
  bounded (registry rows capped, pruned by reachability).

## Implementation

High-level layering; the plan owns sequencing.

- **D1 Seat law.** A machine-global app home (`~/.vaultspec/`) holds the
  seat lock and `service.json` (port, bearer, pid, heartbeat — same shape
  as today's workspace file, which moves up rather than duplicating; the
  workspace-local file is retired in the same cutover, full-cutover
  posture). `serve` acquires the seat lock before binding: conflict with a
  live pid fails loud naming the running seat ("already running — run
  `vaultspec` to open it"); a dead-pid/stale-heartbeat lock is taken over
  and the stale file replaced. `--port 0` and `--no-seat` skip the seat
  (no machine discovery written) — the sanctioned test/dev exemption.
- **D2 Default launch verb.** Bare `vaultspec` (and an explicit
  `vaultspec open`) becomes the app front door: resolve the target
  workspace (cwd inside a workspace wins; else last-active from launcher
  state; else none), ensure the seat (attach to a live seat via
  discovery + `/health`; else spawn `vaultspec serve` detached —
  `CREATE_NO_WINDOW`/`DETACHED_PROCESS` on Windows, session-detached on
  unix — and wait bounded for discovery), register/select the resolved
  workspace through the registry write seam when it isn't the seat's
  current one, then open the browser at the tokenized URL and exit 0. The
  double-clicked console window lives for under a second.
- **D3 Machine-global launcher state.** A small bounded file set under the
  app home: known workspace roots (id, label, path, last-opened), the
  last-active root, and the seat discovery file. Written by the launcher
  and by serve's existing auto-register hook; additive — per-workspace
  user state (sessions, dashboard state, settings) stays where it is.
- **D4 Workspace-less boot + onboarding.** `serve` started with no
  resolvable workspace (the first-ever double-click) boots the seat with
  an empty registry and serves the SPA; the SPA's empty state renders the
  workspace-registration surface (path entry over the registry write
  seam, validated server-side by the same discover/validate used at boot).
  Registering the first workspace warms it exactly like a launch root.
- **D5 Lifecycle verbs + graceful shutdown.** `serve` installs
  ctrl-c/SIGTERM handling via axum `with_graceful_shutdown`: drain
  connections bounded, close SSE, remove the discovery file, release the
  seat. New verbs: `vaultspec stop` (bearer-authed shutdown endpoint from
  discovery, pid-signal fallback, idempotent when nothing runs),
  `vaultspec restart`, and `vaultspec status` grows a seat block (running,
  pid, port, workspaces, uptime) alongside its existing index rollup.
  `vaultspec update` orders stop → axoupdater (receipt-gated, unchanged
  policy) → relaunch.
- **D6 CLI provisioning parity.** One probe/provision module feeds all
  three consumers — the startup WARN gate, the served `/provision`
  projection, and new one-shot CLI verbs (`vaultspec provision status`,
  `provision install`, `provision upgrade`, `provision migrate`) that call
  the same broker code in-process, envelope-shaped per the CLI vocabulary.
  No drift between what the terminal, the boot log, and the GUI claim.
- **D7 Hardening riders.** Discovery writes become atomic
  (write-temp + rename) and owner-checked (a serve only overwrites its own
  pid's file) — closing the clobber race independently of the seat law.
  CSP lands on served responses, authored against the embedded SPA's
  actual inline needs and verified in the live-wire suite. The launcher
  applies a crash-loop guard: it never auto-relaunches a seat that died
  within a backoff window; it reports the crash-log path instead.

## Rationale

The research shows the product is one decision short of being an
application: everything below the front door is delivered. Machine-
singleton (O2) is chosen over per-workspace processes because it is what
"single seat" means operationally — one port, one token, one process to
stop/update — and the engine's own multi-workspace read surface plus rag's
proven lock/discovery/heartbeat pattern make it the low-invention path;
the engine already trusts that exact predicate as a rag client. The
default verb (D2) copies the cohort's convergent design rather than
inventing one, and spawn-detached (vs O3) is what makes double-click feel
like an app on Windows without touching the console subsystem (O4) — the
CLI keeps full piping fidelity. The launcher state (D3, vs O5) is the
smallest machine-global footprint that makes a cwd-less launch resolvable,
honoring the no-bridges posture by being additive and by moving (not
mirroring) the discovery file. Workspace-less boot (D4) is the piece that
makes the app openable on a fresh install, riding surfaces the
provisioning campaign already built. Lifecycle verbs and graceful shutdown
(D5) finish the runtime-ownership story the goal statement names, and one
probe module (D6) keeps the three provisioning mouths honest by
construction. The riders (D7) fix real bugs surfaced by this review
regardless of the rest.

## Consequences

- Double-click and bare `vaultspec` open the dashboard like an app;
  a second launch attaches instead of erroring; `stop`/`restart`/`update`
  give the runtime an owned lifecycle. The clobber race dies.
- The discovery-file move (workspace vault → machine app home) is a
  breaking contract event for anything reading the old path: the vite
  dev plugin, the live-test harness, and any docs must cut over in the
  same change — enumerated as its own plan phase, no compatibility
  shim.
- Serve gains modes (seated/unseated, workspace-less) that multiply the
  boot matrix; the adverse/conformance suites must grow cases for seat
  conflict, takeover, and empty-registry boot.
- A detached seat outlives its launching terminal by design; users who
  expected serve-dies-with-shell must now `vaultspec stop`. Foreground
  `vaultspec serve` remains for that habit and for logs.
- Machine-singleton means two projects cannot run two seats: switching
  projects is a registry/workspace switch inside one app. Dev/test escape
  hatches (`--port 0`, `--no-seat`) are deliberate, documented, and the
  only sanctioned multi-instance paths.
- First-run UX depends on D4's SPA onboarding quality; until a native
  picker (O6, deferred) exists, path entry is typed/pasted.
- New machine-global state (`~/.vaultspec/`) joins rag's as a second app
  home; uninstall docs must name it.
