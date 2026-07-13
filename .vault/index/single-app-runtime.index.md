---
generated: true
tags:
  - '#index'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - '[[2026-07-12-single-app-runtime-W01-P01-S01]]'
  - '[[2026-07-12-single-app-runtime-W01-P01-S02]]'
  - '[[2026-07-12-single-app-runtime-W01-P01-S03]]'
  - '[[2026-07-12-single-app-runtime-W01-P01-S04]]'
  - '[[2026-07-12-single-app-runtime-W01-P01-summary]]'
  - '[[2026-07-12-single-app-runtime-W01-P02-S05]]'
  - '[[2026-07-12-single-app-runtime-W01-P02-S06]]'
  - '[[2026-07-12-single-app-runtime-W01-P02-S07]]'
  - '[[2026-07-12-single-app-runtime-W01-P02-summary]]'
  - '[[2026-07-12-single-app-runtime-W02-P03-S08]]'
  - '[[2026-07-12-single-app-runtime-W02-P03-S09]]'
  - '[[2026-07-12-single-app-runtime-W02-P03-S10]]'
  - '[[2026-07-12-single-app-runtime-W02-P03-S11]]'
  - '[[2026-07-12-single-app-runtime-W02-P03-S12]]'
  - '[[2026-07-12-single-app-runtime-W02-P03-summary]]'
  - '[[2026-07-12-single-app-runtime-W02-P04-S13]]'
  - '[[2026-07-12-single-app-runtime-W02-P04-S14]]'
  - '[[2026-07-12-single-app-runtime-W02-P04-S15]]'
  - '[[2026-07-12-single-app-runtime-W02-P04-summary]]'
  - '[[2026-07-12-single-app-runtime-W03-P05-S16]]'
  - '[[2026-07-12-single-app-runtime-W03-P05-S17]]'
  - '[[2026-07-12-single-app-runtime-W03-P05-summary]]'
  - '[[2026-07-12-single-app-runtime-W03-P06-S18]]'
  - '[[2026-07-12-single-app-runtime-W03-P06-S19]]'
  - '[[2026-07-12-single-app-runtime-W03-P06-S20]]'
  - '[[2026-07-12-single-app-runtime-W03-P06-S21]]'
  - '[[2026-07-12-single-app-runtime-W03-P06-S22]]'
  - '[[2026-07-12-single-app-runtime-W03-P06-summary]]'
  - '[[2026-07-12-single-app-runtime-W03-P07-S23]]'
  - '[[2026-07-12-single-app-runtime-W03-P07-S24]]'
  - '[[2026-07-12-single-app-runtime-W03-P07-S25]]'
  - '[[2026-07-12-single-app-runtime-W03-P07-summary]]'
  - '[[2026-07-12-single-app-runtime-adr]]'
  - '[[2026-07-12-single-app-runtime-audit]]'
  - '[[2026-07-12-single-app-runtime-plan]]'
  - '[[2026-07-12-single-app-runtime-research]]'
---

# `single-app-runtime` feature index

Auto-generated index of all documents tagged with `#single-app-runtime`.

## Documents

### adr

- `2026-07-12-single-app-runtime-adr` - `single-app-runtime` adr: `the principal binary as the application: seat law, default launch verb, lifecycle ownership` | (**status:** `accepted`)

### audit

- `2026-07-12-single-app-runtime-audit` - `single-app-runtime` audit: `post-execution review of the seat law, front door, and lifecycle runtime`

### exec

- `2026-07-12-single-app-runtime-W01-P01-S01` - Make the discovery write atomic (write-temp then rename) and owner-checked so a serve only overwrites a discovery file carrying its own pid, with a unit test proving two concurrent writers cannot interleave
- `2026-07-12-single-app-runtime-W01-P01-S02` - Introduce the machine app home module resolving the per-user app directory, owning the seat discovery path and a bounded launcher-state file recording known workspace roots (id, label, path, last-opened) plus the last-active root, with rows capped and pruned by reachability
- `2026-07-12-single-app-runtime-W01-P01-S03` - Acquire the seat lock at serve boot via an OS lock primitive with dead-pid and stale-heartbeat takeover, fail-loud conflict naming the running seat, and the sanctioned exemptions (--port 0 implying no seat, plus an explicit --no-seat flag) declared at the flag site
- `2026-07-12-single-app-runtime-W01-P01-S04` - Cut seated discovery over to the app home service.json (retiring the workspace-local write for seated serves) while exempt no-seat serves keep the workspace-local file byte-compatible, and pass --no-seat from the dev-plugin and test-harness spawn sites
- `2026-07-12-single-app-runtime-W01-P01-summary` - `single-app-runtime` `W01.P01` summary
- `2026-07-12-single-app-runtime-W01-P02-S05` - Install signal-driven graceful shutdown (ctrl-c and SIGTERM through axum with_graceful_shutdown) that drains connections bounded, closes SSE streams, removes the discovery file, and releases the seat on every exit path
- `2026-07-12-single-app-runtime-W01-P02-S06` - Serve a bearer-authed shutdown endpoint that triggers the same graceful path and answers before draining, with adverse coverage for unauthenticated and repeated calls
- `2026-07-12-single-app-runtime-W01-P02-S07` - Add the stop and restart CLI verbs (discovery-driven shutdown call with pid-signal fallback, idempotent when nothing runs) and grow the status verb with a seat block reporting running state, pid, port, registered workspaces, and uptime
- `2026-07-12-single-app-runtime-W01-P02-summary` - `single-app-runtime` `W01.P02` summary
- `2026-07-12-single-app-runtime-W02-P03-S08` - Add the browser-launch helper over the open crate (pinned, maintenance-verified) with the standard subprocess posture and a typed fallback that prints the tokenized URL when no browser opens
- `2026-07-12-single-app-runtime-W02-P03-S09` - Implement the launcher flow: resolve the target workspace (cwd inside a workspace wins, else last-active from launcher state, else none), probe the seat running-predicate (discovery freshness plus health plus live pid), spawn vaultspec serve detached (CREATE_NO_WINDOW or DETACHED_PROCESS on Windows, session-detached on unix) with a bounded discovery wait, then open the browser and exit
- `2026-07-12-single-app-runtime-W02-P03-S10` - Wire bare invocation (no subcommand) and an explicit open verb to the launcher flow while every existing verb stays byte-identical, including --json envelopes and exit codes, with CLI tests over both doors
- `2026-07-12-single-app-runtime-W02-P03-S11` - On attach to a live seat, register and select the resolved workspace through the existing session-state write seam over HTTP when it is not the seat's active one, updating launcher-state last-active on every successful open
- `2026-07-12-single-app-runtime-W02-P03-S12` - Add the crash-loop guard: the launcher never auto-relaunches a seat that died within the backoff window and instead reports the crash-log path, with friendly plain-language errors for every launcher failure
- `2026-07-12-single-app-runtime-W02-P03-summary` - `single-app-runtime` `W02.P03` summary
- `2026-07-12-single-app-runtime-W02-P04-S13` - Let serve boot the seat with no resolvable workspace: empty registry mode with honest tiers (no workspace registered stated per component), the SPA served, and every workspace-scoped route answering typed empty rather than erroring
- `2026-07-12-single-app-runtime-W02-P04-S14` - Render the SPA first-run onboarding empty state that registers the first workspace by validated path entry through the workspace-registry write seam, then warms and selects it like a launch root
- `2026-07-12-single-app-runtime-W02-P04-S15` - Grow the adverse and conformance suites with the new boot matrix: seat conflict fails loud, dead-pid takeover succeeds, no-seat exemption writes no machine discovery, empty-registry boot serves onboarding, graceful shutdown cleans discovery
- `2026-07-12-single-app-runtime-W02-P04-summary` - `single-app-runtime` `W02.P04` summary
- `2026-07-12-single-app-runtime-W03-P05-S16` - Extract the single probe-and-provision module so the startup WARN gate, the served provision projection, and the CLI all consume one source of component floors, probes, and remediation strings
- `2026-07-12-single-app-runtime-W03-P05-S17` - Add one-shot CLI provisioning verbs (provision status, install, upgrade, migrate) calling the shared broker in-process with the standard envelope vocabulary, exit codes, and the confirm-gated force posture the wire enforces
- `2026-07-12-single-app-runtime-W03-P05-summary` - `single-app-runtime` `W03.P05` summary
- `2026-07-12-single-app-runtime-W03-P06-S18` - Author and serve the Content-Security-Policy header against the embedded SPA's actual inline needs, verified in the live-wire suite across embedded and disk-passthrough asset sources
- `2026-07-12-single-app-runtime-W03-P06-S19` - Add the update verb ordering stop, receipt-gated axoupdater, relaunch, refusing when the receipt marks a package-manager install and never auto-updating
- `2026-07-12-single-app-runtime-W03-P06-S20` - Configure installer-created launch shortcuts in the dist pipeline and document install, first-run, lifecycle verbs, the app home, and uninstall (naming the machine-global state) in the user docs
- `2026-07-12-single-app-runtime-W03-P06-S21` - Run the full gate (just dev lint all plus engine and frontend suites) and a release dry-run building the embed-spa binary, verifying double-click launch, attach, stop, and update flows end to end on Windows
- `2026-07-12-single-app-runtime-W03-P06-S22` - Ship the msi installer channel with an installer-created Start-Menu shortcut whose target is the bare binary (the app front door), delivered after the user directed the deferral executed
- `2026-07-12-single-app-runtime-W03-P06-summary` - `single-app-runtime` `W03.P06` summary
- `2026-07-12-single-app-runtime-W03-P07-S23` - Publish discovery immediately after the bind with a starting state and keep the heartbeat fresh through the initial index, flipping to ready before serving
- `2026-07-12-single-app-runtime-W03-P07-S24` - Serve a bounded, bearer-gated, read-only directory-listing route (filesystem roots plus one directory level, directories only, capped count, vaultspec-managed and git markers) through the shared envelope, with adverse coverage (tokenless refusal, non-directory refusal, cap honored)
- `2026-07-12-single-app-runtime-W03-P07-S25` - Add a Browse affordance to the add-project flow consuming the new directory-listing route (drill-down list, managed and git badges, select-to-fill-the-path), replacing typed-path-only entry for first-run onboarding and the project switcher alike
- `2026-07-12-single-app-runtime-W03-P07-summary` - `single-app-runtime` `W03.P07` summary

### plan

- `2026-07-12-single-app-runtime-plan` - `single-app-runtime` plan

### research

- `2026-07-12-single-app-runtime-research` - `single-app-runtime` research: `the principal binary as the application — double-click launch, single-instance law, lifecycle ownership`
