---
tags:
  - '#plan'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
tier: L3
related:
  - '[[2026-07-12-single-app-runtime-adr]]'
  - '[[2026-07-12-single-app-runtime-research]]'
---

# `single-app-runtime` plan

## Wave `W01` - Seat law and lifecycle core

Make the engine itself obey the single-seat law: fix the discovery clobber race, stand up the machine-global app home, acquire and take over the seat lock at serve boot, and give the resident process an owned lifecycle (graceful shutdown, stop/restart verbs, seat-aware status). ADR D1, D3 (state file), D5, D7 (race).

### Phase `W01.P01` - Discovery hardening and seat foundation

Close the service.json clobber race independently of the seat law, then introduce the machine app home and the seat lock with its takeover protocol and the sanctioned no-seat exemptions, cutting discovery over to the app home for seated serves while exempt serves keep the workspace-local file unchanged.

- [x] `W01.P01.S01` - Make the discovery write atomic (write-temp then rename) and owner-checked so a serve only overwrites a discovery file carrying its own pid, with a unit test proving two concurrent writers cannot interleave; `engine/crates/vaultspec-api/src/app.rs`.
- [x] `W01.P01.S02` - Introduce the machine app home module resolving the per-user app directory, owning the seat discovery path and a bounded launcher-state file recording known workspace roots (id, label, path, last-opened) plus the last-active root, with rows capped and pruned by reachability; `engine/crates/vaultspec-session/src/app_home.rs`.
- [x] `W01.P01.S03` - Acquire the seat lock at serve boot via an OS lock primitive with dead-pid and stale-heartbeat takeover, fail-loud conflict naming the running seat, and the sanctioned exemptions (--port 0 implying no seat, plus an explicit --no-seat flag) declared at the flag site; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W01.P01.S04` - Cut seated discovery over to the app home service.json (retiring the workspace-local write for seated serves) while exempt no-seat serves keep the workspace-local file byte-compatible, and pass --no-seat from the dev-plugin and test-harness spawn sites; `engine/crates/vaultspec-api/src/app.rs + frontend/vite-plugins/engine-dev.ts + frontend/src/testing/liveEngine.globalSetup.ts + frontend/e2e/authoring/engine.ts`.

### Phase `W01.P02` - Graceful shutdown and lifecycle verbs

Give the seat an owned lifecycle: signal-driven graceful shutdown that drains connections and cleans discovery, a bearer-authed shutdown endpoint, and CLI stop/restart plus a seat block on status.

- [x] `W01.P02.S05` - Install signal-driven graceful shutdown (ctrl-c and SIGTERM through axum with_graceful_shutdown) that drains connections bounded, closes SSE streams, removes the discovery file, and releases the seat on every exit path; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W01.P02.S06` - Serve a bearer-authed shutdown endpoint that triggers the same graceful path and answers before draining, with adverse coverage for unauthenticated and repeated calls; `engine/crates/vaultspec-api/src/routes/lifecycle.rs`.
- [x] `W01.P02.S07` - Add the stop and restart CLI verbs (discovery-driven shutdown call with pid-signal fallback, idempotent when nothing runs) and grow the status verb with a seat block reporting running state, pid, port, registered workspaces, and uptime; `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`.

## Wave `W02` - The application front door

Make bare vaultspec (and a double-click) open the app: the launcher flow that resolves a workspace without a cwd, attaches to a live seat or spawns one detached, registers the workspace, and opens the browser; plus the workspace-less first-run boot with SPA onboarding. ADR D2, D3 (launcher), D4.

### Phase `W02.P03` - Default launch verb and attach-or-spawn

Author the launcher: browser-launch helper, workspace resolution (cwd, then last-active, then none), seat probe over discovery plus health, detached spawn with bounded discovery wait, registry select on attach, crash-loop guard, and bare-invocation default wiring.

- [x] `W02.P03.S08` - Add the browser-launch helper over the open crate (pinned, maintenance-verified) with the standard subprocess posture and a typed fallback that prints the tokenized URL when no browser opens; `engine/crates/vaultspec-cli/src/cmd/launch.rs`.
- [x] `W02.P03.S09` - Implement the launcher flow: resolve the target workspace (cwd inside a workspace wins, else last-active from launcher state, else none), probe the seat running-predicate (discovery freshness plus health plus live pid), spawn vaultspec serve detached (CREATE_NO_WINDOW or DETACHED_PROCESS on Windows, session-detached on unix) with a bounded discovery wait, then open the browser and exit; `engine/crates/vaultspec-cli/src/cmd/launch.rs`.
- [x] `W02.P03.S10` - Wire bare invocation (no subcommand) and an explicit open verb to the launcher flow while every existing verb stays byte-identical, including --json envelopes and exit codes, with CLI tests over both doors; `engine/crates/vaultspec-cli/src/main.rs`.
- [x] `W02.P03.S11` - On attach to a live seat, register and select the resolved workspace through the existing session-state write seam over HTTP when it is not the seat's active one, updating launcher-state last-active on every successful open; `engine/crates/vaultspec-cli/src/cmd/launch.rs`.
- [x] `W02.P03.S12` - Add the crash-loop guard: the launcher never auto-relaunches a seat that died within the backoff window and instead reports the crash-log path, with friendly plain-language errors for every launcher failure; `engine/crates/vaultspec-cli/src/cmd/launch.rs`.

### Phase `W02.P04` - Workspace-less boot and onboarding

Let serve boot the seat with an empty registry and honest tiers so a fresh install opens to the SPA onboarding empty state, which registers the first workspace by path through the existing registry write seam; harden the new boot matrix in the adverse and conformance suites.

- [x] `W02.P04.S13` - Let serve boot the seat with no resolvable workspace: empty registry mode with honest tiers (no workspace registered stated per component), the SPA served, and every workspace-scoped route answering typed empty rather than erroring; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W02.P04.S14` - Render the SPA first-run onboarding empty state that registers the first workspace by validated path entry through the workspace-registry write seam, then warms and selects it like a launch root; `frontend/src/app/onboarding/`.
- [x] `W02.P04.S15` - Grow the adverse and conformance suites with the new boot matrix: seat conflict fails loud, dead-pid takeover succeeds, no-seat exemption writes no machine discovery, empty-registry boot serves onboarding, graceful shutdown cleans discovery; `engine/crates/vaultspec-api/tests/`.

## Wave `W03` - Provisioning parity, hardening, closeout

Give the terminal the same provisioning mouth the GUI has via one shared probe module, land the deferred CSP, coordinate self-update with the running seat, and close out docs, installer shortcuts, and the full gate. ADR D6, D7, D5 (update).

### Phase `W03.P05` - CLI provisioning parity

Extract one probe-and-provision module feeding the startup gate, the served provision projection, and new one-shot CLI provision verbs, so terminal, boot log, and GUI cannot disagree.

- [x] `W03.P05.S16` - Extract the single probe-and-provision module so the startup WARN gate, the served provision projection, and the CLI all consume one source of component floors, probes, and remediation strings; `engine/crates/vaultspec-api/src/provisioning/`.
- [x] `W03.P05.S17` - Add one-shot CLI provisioning verbs (provision status, install, upgrade, migrate) calling the shared broker in-process with the standard envelope vocabulary, exit codes, and the confirm-gated force posture the wire enforces; `engine/crates/vaultspec-cli/src/cmd/provision.rs`.

### Phase `W03.P06` - Hardening, update coordination, closeout

CSP against the embedded SPA verified on the live wire, the update verb ordered stop-update-relaunch, install and uninstall docs naming the app home, installer shortcut configuration, and the full lint plus test gate with a release dry-run.

- [x] `W03.P06.S18` - Author and serve the Content-Security-Policy header against the embedded SPA's actual inline needs, verified in the live-wire suite across embedded and disk-passthrough asset sources; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W03.P06.S19` - Add the update verb ordering stop, receipt-gated axoupdater, relaunch, refusing when the receipt marks a package-manager install and never auto-updating; `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`.
- [x] `W03.P06.S20` - Configure installer-created launch shortcuts in the dist pipeline and document install, first-run, lifecycle verbs, the app home, and uninstall (naming the machine-global state) in the user docs; `dist-workspace.toml + docs/`.
- [x] `W03.P06.S21` - Run the full gate (just dev lint all plus engine and frontend suites) and a release dry-run building the embed-spa binary, verifying double-click launch, attach, stop, and update flows end to end on Windows; `justfile + .github/workflows/`.

## Description

Implement the accepted single-app-runtime ADR: turn the shipped single
binary into the de facto application. W01 makes the engine obey the seat
law (atomic owner-checked discovery, machine app home, seat lock with
takeover, graceful shutdown, stop/restart/status verbs). W02 builds the
front door (bare invocation and an explicit open verb that attach-or-spawn
the seat detached and open the browser, plus workspace-less first-run boot
with SPA onboarding). W03 delivers CLI provisioning parity over one shared
probe module, the deferred CSP, update coordination, installer shortcuts,
docs, and the full gate. Grounded in the single-app-runtime research and
ADR named in the frontmatter; parents are the dashboard-packaging pipeline
(shipped), the workspace-registry read/write seams (shipped), and the
provisioning plane (shipped).

## Steps

## Parallelization

Waves are sequenced: W01 (seat law, lifecycle) must land before W02 (the
launcher depends on seat discovery, takeover, and graceful shutdown), and
W02 before W03's closeout gate (S21 verifies the full launch matrix).
Within W01, P01 and P02 are sequential (shutdown releases the seat P01
creates), but S01 (atomic discovery write) is independent and may land
first in isolation. Within W02, P03 and P04 may proceed in parallel after
W01 (the launcher and the workspace-less boot touch disjoint files except
the serve boot in `engine/crates/vaultspec-api/src/lib.rs`, which S13
owns; coordinate that file). Within W03, P05 is independent of P06 and
both may run in parallel; S21 is terminal and strictly last. The frontend
step S14 may be executed by a frontend-lane agent concurrently with any
engine step once S13 fixes the wire shape.

## Verification

- Full gate green: `just dev lint all` exit 0 plus the engine test suite
  and the frontend live-wire vitest suite, both unmodified, passing.
- Adverse/conformance matrix (S15) proves: a second seated serve fails
  loud; dead-pid takeover succeeds; `--port 0` and `--no-seat` write no
  machine discovery and keep the workspace-local file byte-compatible;
  graceful shutdown removes discovery and releases the seat;
  empty-registry boot serves the onboarding SPA with honest tiers.
- Concurrent-writer unit test (S01) proves discovery writes cannot
  interleave or clobber a foreign pid's file.
- End-to-end on Windows (S21): bare invocation from Explorer opens the
  browser to a live authenticated dashboard in one action; a second
  launch attaches to the same seat; stop terminates it cleanly; update
  refuses on a package-manager receipt.
- CLI provisioning verbs and the served provision projection report
  identical component floors and remediation strings (S16/S17 parity
  test over the shared module).
- CSP (S18) verified in the live-wire suite against both embedded and
  disk-passthrough asset sources with no SPA regression.
- Existing CLI verbs remain byte-identical in `--json` envelope shape and
  exit codes (S10 regression tests).
- Reviewer sign-off via vaultspec-code-review per wave; the plan is
  complete when all 21 Steps are closed.
