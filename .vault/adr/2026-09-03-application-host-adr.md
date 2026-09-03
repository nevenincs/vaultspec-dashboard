---
tags:
  - '#adr'
  - '#application-host'
date: '2026-09-03'
modified: '2026-09-03'
body_schema: 'body-v2'
body_hash: 'sha256:2a7d07c594572e6d28349318e894cc6b2e7d11fe08a22b6ed3680a0c544a7992'
related:
  - '[[2026-09-03-application-host-research]]'
  - '[[2026-07-12-single-app-runtime-adr]]'
  - '[[2026-07-04-dashboard-packaging-adr]]'
  - '[[2026-07-18-a2a-product-provisioning-adr]]'
  - '[[2026-07-24-a2a-product-provisioning-adr]]'
  - '[[2026-07-20-a2a-provisioning-authority-adr]]'
  - '[[2026-07-08-distribution-channels-adr]]'
---

# `application-host` adr: `one Rust host, a component generation tree, and an orchestrator that owns the siblings` | (**status:** `proposed`)

## Problem Statement

The product ships components and calls them a release. The v0.1.12 archive is a
console binary with an embedded SPA plus an updater; the components it needs at
run time are found on PATH or attached to, nothing carries them, nothing
supervises them, and the binary has no native identity on any platform. The
delivered runtime laws (seat, launcher, lifecycle verbs, provisioning broker,
a2a generation tree) are the floor of an application, not the application. This
record decides the host language, the shape of the binary that is both a
terminal CLI and a double-clickable app, the on-disk package tree that holds
every component, and the orchestrator that owns their processes, ports and
memory. It must decide now because three distribution channels refuse every
tag while their proofs target the wrong artifact, and because two accepted
postures (detect-and-instruct, attach-never-own) block the orchestrator by
design. Grounding is `2026-09-03-application-host-research`.

## Considerations

- Rewrite cost dominates: eighteen shipped Rust crates, four targets, an owned
  updater and MSI. Only Rust-shaped hosts leave them untouched (research F2).
- The cohort separates app from CLI; the one single-file precedent is a
  heuristic, and the Windows subsystem model makes a clean single file
  impossible (F3). Single-app-runtime O4 already rejected dual subsystem.
- Windows and Linux identity is a build script and a desktop entry; an
  unsigned macOS `.app` is worse UX than the current tarball under Sequoia,
  so bundle sequencing is a signing-funding question (F4).
- CUDA torch is 16x to 21x the CPU wheel and 3 GB downloaded on Linux; no
  comparable product bundles it, and torch is only rag's `gpu` extra. A
  stripped python-build-standalone interpreter is 22 MB to 35 MB and uv
  exposes every flag an app-owned offline lifecycle needs (F6).
- No supervisor crate exists; the owned-gateway containment module is the
  in-house precedent, and `command-group` is succeeded by `process-wrap` (F7).
- Child-death and memory bounding are asymmetric: solved on Windows, needs
  delegation on Linux, admission-only on macOS (F7).
- Workspace `unsafe_code = "forbid"` and the `graph` rule's no-GPU-dependency
  law constrain where native and probe code may live (F1, F7).
- The served page already hands the bearer to whoever reaches the loopback
  port, so an SSH forward yields the full GUI today; remote vault reading is
  a strength to retain, not a hole to close (research F1 substrate).
- The a2a generation tree, sealed transaction, receipts and TUF authority are
  delivered and certified; the component question is what fills that tree,
  not its shape (F1, F6).

## Considered options

- **O1 Plain Rust host: grow the existing binary with a supervisor crate, add
  identity by build script and per-OS packaging steps — CHOSEN.** Zero new
  runtime, toolchain or CI leg; identity is hand-built; no tray.
- **O2 Rust + Tauri v2 shell as bundler, tray and single-instance host —
  rejected for the first increment, retained as the named second increment.**
  Gains bundling and a tray; costs WebKitGTK and appindicator at runtime on
  Linux (absent from the pinned manylinux images), a second updater beside the
  seat-locked one, an unverified zero-window mode, and a console-write caveat
  on Windows. Its risks are testable in days and are re-evaluated once O1 ships.
- **O3 Go supervisor or Go rewrite — rejected.** Second toolchain for no
  capability, or a full rewrite; tray needs CGO where cross-compilation matters.
- **O4 C++/Qt host — rejected.** Third language and build system, FFI through
  a `forbid(unsafe)` workspace, dual-licence constraints, months-scale.
- **O5 Electron shell — rejected.** Node runtime plus a second browser engine
  for an SPA already in the user's browser; `.app` cannot be the CLI.
- **O6 One file, two modes by environment sniffing (Tailscale) — rejected.**
  Heuristic, known symlink hang; structurally impossible on Windows.
- **O7 Two binaries on Windows, console binary as the `.app`/`.desktop` target
  elsewhere — CHOSEN.** A tiny `windows`-subsystem launcher carries the icon and
  version resource and executes the console CLI's open verb; the composed tree
  already carries a second binary, so the third is nearly free.
- **O8 Bundle every Python component in the installer — rejected.** CPU-only
  adds 150 MB to 230 MB per platform before core's deps; CUDA adds 2 GB to 3 GB.
- **O9 Provision every Python component at first run, including the
  interpreter — rejected.** Time-to-first-use and offline story depend on
  GitHub and PyPI; the interpreter is cheap enough to carry.
- **O10 Carry the interpreter and uv in the immutable tree, provision the
  packages into a verified generation — CHOSEN.** The hybrid the cohort
  converges on, under the existing TUF and lock machinery.
- **O11 PyOxidizer / pyapp / PyInstaller for core and rag — rejected.**
  PyOxidizer is unmaintained; pyapp has no integrity check; a PyInstaller
  onedir cannot hold torch. PyInstaller stays for the a2a capsule as decided.
- **O12 Resident-service registration (systemd user unit, LaunchAgent,
  Windows service) — rejected.** Moves ownership out of the binary, needs an
  elevated installer step, breaks the `--no-seat`/`--port 0` contract. Its one
  gain, Linux cgroup delegation, is taken as an opt-in, not a default.
- **O13 cargo-packager for all three OSes — rejected for now.** First-class
  sidecars, but unverified against a pre-composed product tree; the owned MSI
  and install scripts already do the job and a shell-built `.app` is forty
  lines. cargo-dist stays the target planner and release host.
- **O14 Tray icon from the host process — rejected.** Requires a platform
  event loop and GTK on Linux inside a tokio binary; the auto-opened browser
  plus the `status` verb is the delivered affordance, and a tray belongs to O2.

## Constraints

- **Two accepted postures are superseded by this record, and each is a
  reviewed contract event:** the packaging ADR's detect-and-instruct for
  Python siblings, and the `rag-integration` rule's attach-never-own. The rule
  file is rewritten in the same change that lands D4, not after it.
- **Signing is unfunded today.** SignPath Foundation is free for OSS and is
  applied for before any `.app` work; the Apple Developer Program is an owner
  funding decision. Until macOS signing exists, no `.app` is published and the
  channel matrix keeps Homebrew feasibility-gated. The MSI and Linux tree ship
  unsigned as they do now.
- **Torch on the base rag is unverified.** Whether base `vaultspec-rag` embeds
  locally without torch is the first plan check; if it does not, the CPU torch
  wheel is part of the default provisioned set and the size budget in D3
  grows by 124 MB to 196 MB.
- **macOS cannot cap child memory and cannot pdeathsig.** D4's macOS posture is
  admission control plus an RSS watchdog and boot-time reconciliation; this is
  documented, not papered over.
- **Linux memory caps need a delegated cgroup.** An unprivileged binary cannot
  create one; D4 applies `memory.max` only when `systemd-run --user --scope`
  is available and otherwise falls back to admission control.
- **`unsafe_code = "forbid"` is workspace-wide.** Job-object memory limits,
  kqueue and Win32 resource embedding live in dependencies (`process-wrap`,
  `windows-sys`, `winresource`) or in one fenced host crate that carries its
  own lint allowance; no engine crate gains `unsafe`.
- **GPU probing may not add CUDA, torch or wgpu to any engine crate.** The
  probe is out-of-process (D7).
- **`process-wrap` `JobObject` spawns suspended,** which interacts with the
  launcher's `DETACHED_PROCESS`/`CREATE_NO_WINDOW` flags; the migration from
  `command-group` is verified against the existing grandchild-cleanup tests.
- **Relocatability of python-build-standalone** requires path rewriting; the
  existing relocation certification case extends to the carried interpreter.
- **Parent stability:** the seat law, lifecycle verbs, provisioning broker,
  generation tree, sealed transaction and TUF authority are accepted and
  delivered; this record extends their scope and changes none of their
  contracts. Every accumulator, subprocess and artifact-store law binds
  unchanged.

## Implementation

High-level layering; the plan owns sequencing.

- **D1 Host language and crate shape.** Rust. One new library crate,
  `vaultspec-host`, owns component specs, the supervisor, the port and memory
  policy, and the package-tree authority; the existing `vaultspec` console
  binary consumes it and remains the CLI, the seat, and the app front door.
  On Windows a second, minimal `windows`-subsystem binary, `vaultspec-app`,
  carries the icon and version resource and executes `vaultspec open`; on
  macOS and Linux the console binary is the `.app` and `.desktop` target and
  exits after detaching the seat. The console binary also gains a `build.rs`
  embedding icon and VERSIONINFO via `winresource` so Explorer shows product
  identity on the CLI too.
- **D2 Package tree.** Two roots on every OS. The immutable install tree:
  `bin/` (dashboard, `vaultspec-app` on Windows, updater), `runtime/`
  (stripped python-build-standalone interpreter, `uv`), `components/`
  (the a2a onedir when adopted, per the a2a ADRs), `release.json`, `licenses/`,
  `sbom.cdx.json`, and per-OS identity (`Info.plist` and `.icns` under
  `Contents/`, `.desktop` and hicolor icons beside the Linux tree, MSI
  shortcuts). Default locations: `%LOCALAPPDATA%\Programs\Vaultspec`,
  `/Applications/Vaultspec.app`, `~/.local/opt/vaultspec` with `/opt/vaultspec`
  for system installs. The mutable app home stays `~/.vaultspec` (XDG split
  deferred, recorded as a migration the plan may not start) and generalizes
  the a2a root: `components/<name>/generations/<gen-id>/` immutable,
  `components/<name>/home/` mutable, with the same transaction, staging,
  receipt and lock machinery, so the a2a root becomes `components/a2a`.
- **D3 What fills the tree.** Carried in the install tree: interpreter, uv,
  a2a onedir. Provisioned into a component generation at first run or on
  operator demand, through the existing provisioning broker calling the
  carried uv with app-owned `UV_PYTHON_INSTALL_DIR`, `UV_TOOL_DIR`,
  `UV_CACHE_DIR` and `UV_TOOL_BIN_DIR`: `vaultspec-core` and `vaultspec-rag`
  packages at versions pinned in a `components.lock.json` that generalizes the
  a2a component lock (exact versions, wheel digests, index URL). Default rag
  set is CPU; the CUDA extra is an opt-in provisioning verb chosen by the
  probe in D7 and never bundled. Offline installs are first-class: the lock
  names the wheelhouse layout and `--no-index --find-links` is the path.
  rag keeps provisioning its own Qdrant binary inside its component home; the
  host does not reach into rag's internals. Every provisioned artifact is
  verified by the distribution authority before activation.
- **D4 Orchestrator.** `vaultspec-host::supervisor` generalizes the owned
  gateway module to N components, each a typed `ComponentSpec`: launch
  entrypoint resolved generation-relative, readiness probe, port-report
  channel, restart policy (exponential backoff, crash-loop threshold that
  parks the component and degrades its tier), bounded log ring, ordered
  dependencies, teardown budget. Containment moves from `command-group` to
  `process-wrap`: job object with kill-on-close on Windows, process group plus
  `PR_SET_PDEATHSIG` on Linux, process group on macOS with discovery-file
  reconciliation at next boot. Ports: the child binds and reports; the
  supervisor records a per-service block (port, bearer, pid, heartbeat) in
  the seat discovery file; a bind failure is a retry, never a pre-assignment.
  Memory: Windows `JOB_OBJECT_LIMIT_JOB_MEMORY` per component; Linux
  `memory.max` when a delegated scope is available; everywhere an admission
  floor over `sysinfo` available memory before spawning rag, and an RSS
  watchdog that kills and parks a runaway. Ownership: the host owns the core
  and rag it provisioned. A foreign live rag holding the machine lock is
  attached read-only and never displaced, mirroring the a2a foreign-gateway
  law; the `rag-integration` rule is rewritten to state both cases. Core
  keeps its per-call invocation shape but resolves from the component
  generation, never PATH.
- **D5 Identity and channel sequencing.** Windows: `build.rs` resources on
  both binaries, `vaultspec-app` as an MSI component with Start Menu shortcut,
  Scoop and WinGet phase-zero proofs re-pointed at the composed tree and the
  Scoop manifest moved to the organisation bucket as the distribution ADR
  already requires. Linux: `.desktop` and icons written by `install.sh`.
  macOS: a shell-built `.app` in CI behind a signing gate; unsigned builds are
  produced for verification and never published; the tarball remains the
  shipped macOS artifact until notarization exists. Homebrew stays
  feasibility-gated until then.
- **D6 Packaging tools.** cargo-dist remains the target planner, checksum
  producer and release host with `installers = []`. The owned WiX package,
  `install.sh`, `install.ps1` and the new `.app` script compose the tree.
  cargo-packager is the recorded fallback if hand-rolled steps outgrow
  maintenance.
- **D7 Probes.** GPU presence is an out-of-process probe: `nvidia-smi` on PATH
  with a bounded subprocess, or the provisioned interpreter's own report,
  surfaced through `tiers` and the provisioning projection. No engine crate
  gains a GPU dependency. Available memory comes from `sysinfo`.
- **D8 Degradation policy.** Every component carries one of three declared
  degradation classes in its `ComponentSpec`, served through `tiers`:
  *blocking* (the seat refuses to serve the GUI and reports the remediation:
  a missing or below-floor core, an unverifiable generation), *parking* (the
  feature greys and the supervisor stops retrying: a crash-looped rag, a
  refused a2a attach), and *advisory* (a warning only: no GPU, low memory
  headroom). The class is declared once in the spec, never inferred by a
  surface, and the launcher, the status verb and the SPA read the same value.
- **D9 Remote reachability.** Anyone who reaches the seat's port is served
  the GUI. The bind stays loopback with Host validation, the page is served
  bearer-less with the token injected, and the sanctioned remote path is an
  SSH port forward to that loopback port: a user forwarding a remote machine's
  seat reads that machine's vaults in the full dashboard with no extra step.
  This is a retained capability, guarded by the live-wire suite through a
  forwarded-origin case. Binding to a non-loopback interface (a Tailscale or
  LAN address) is not decided here; it changes the trust boundary and needs
  its own record covering Host validation, TLS or tailnet identity, and
  bearer custody.

## Rationale

Rust is not chosen for taste; it is the only language with zero cost on the
axis that dominates every other, the shipped engine, and the research shows
every alternative pays that cost for a capability Rust already has. The two
Rust shapes differ only in identity and tray, and O1 ships in weeks with no
new runtime dependency while O2's specific risks are unverified; sequencing
O1 first and naming O2 as the next increment keeps the option without paying
for it now. The two-binary answer on Windows is what every shipped
double-clickable CLI product does, because the subsystem model leaves no clean
alternative, and the composed tree makes it nearly free. Carrying the
interpreter and provisioning the packages is the cohort's convergent design
and the only one whose size, offline and integrity stories all hold: the
interpreter is cheap and static, the packages are large and variant, and the
project already owns the verified generation machinery to receive them.
Generalizing the a2a root to `components/<name>` extends a certified tree
instead of inventing a second one. The orchestrator is written, not adopted,
because nothing to adopt exists and the containment layer already does the
hard part for one child. Admission control on macOS and delegated cgroups on
Linux are the honest posture the platforms allow. Deferring the `.app` until
signing exists follows directly from Sequoia's Gatekeeper: publishing an
unsigned bundle would degrade the macOS experience the tarball delivers today.

## Consequences

- The release artifact becomes a product tree with `bin/`, `runtime/` and
  `components/`, and the channel proofs must prove that tree. Scoop, WinGet
  and Homebrew gates stay red until re-pointed; the plan's first phase is the
  channel re-point, not the supervisor.
- Detect-and-instruct is superseded: a missing core or rag becomes a
  provisioning job the app runs, not an instruction to the user. The startup
  gate and the `/provision/*` projection change shape.
- The `rag-integration` rule changes from attach-never-own to own-what-you-
  provisioned, attach-foreign-read-only. rag's `STATUS_DIR` remains
  untouched; the host discovers rag the same way and additionally knows which
  rag it started.
- The app home grows `runtime` and `components` state; uninstall docs and
  `vaultspec provision remove` must reclaim it, including the uv cache, under
  the artifact-store bound.
- First run on a fresh machine downloads the pinned package set (hundreds of
  megabytes CPU-only); offline installs need the wheelhouse the lock names.
- Two Windows binaries and a build script raise the release-inputs guard
  surface; the existing Cargo.lock and preflight guards extend to them.
- macOS users keep the tarball until signing is funded; the `.app` exists in
  CI as an unpublished proof.
- Memory bounding is uneven by platform and is reported as such through
  `tiers`; a runaway rag on macOS is killed by the watchdog, not capped.
- Tauri (O2) is the recorded next increment for tray and bundling; adopting
  it is a new ADR, not an amendment.
- Reading a remote machine's vaults through an SSH-forwarded seat is a named
  product capability with a guard; any future bind or Host-validation change
  must keep it or supersede D9 explicitly.
- Degradation gains a hard-stop class: a below-floor core now refuses the GUI
  at the seat instead of serving greyed surfaces.
- The a2a provisioning ADRs are amended in wording only: their root moves to
  `components/a2a` and their capsule becomes one of several components under
  one lock.
