---
tags:
  - '#research'
  - '#application-host'
date: '2026-09-03'
modified: '2026-09-03'
body_schema: 'body-v2'
body_hash: 'sha256:ccfc8af16738999fcde8ebb8b84f7a6609476de2eaa6c3d4d65af94903ae3fe5'
related:
  - '[[2026-07-12-single-app-runtime-adr]]'
  - '[[2026-07-04-dashboard-packaging-adr]]'
  - '[[2026-07-18-a2a-product-provisioning-adr]]'
  - '[[2026-07-24-a2a-product-provisioning-adr]]'
  - '[[2026-07-20-a2a-provisioning-authority-adr]]'
  - '[[2026-07-07-project-provisioning-adr]]'
  - '[[2026-07-08-distribution-channels-adr]]'
  - '[[2026-07-12-single-app-runtime-research]]'
  - '[[2026-07-04-dashboard-packaging-research]]'
---

# `application-host` research: `the application binary, its package tree, and the orchestrator that owns the components`

The question is what the shipped *application* is, as distinct from the components
that have been shipping under that name. Release v0.1.12 publishes a product zip
whose whole payload is `bin/vaultspec.exe`, `bin/vaultspec-updater.exe`, a release
manifest, a licence directory and an SBOM (release assets at
https://github.com/nevenincs/vaultspec-dashboard/releases/tag/v0.1.12). The
sibling components the product depends on — `vaultspec-core` (Python CLI, invoked
per call), `vaultspec-rag` (Python HTTP service that provisions its own Qdrant
binary), and `vaultspec-a2a` (a PyInstaller onedir the dashboard was to build and
install) — are resolved from PATH or attached to, never carried, never supervised.
The binary has no icon, no version resource, no `.app` bundle and no desktop entry.
Three channel gates (Scoop, WinGet, Homebrew) have refused every tag since v0.1.10
because their phase-zero proofs run against this incomplete artifact. The stakes:
the ADR must decide the host language, the shape of the one binary that is both a
terminal CLI and a double-clickable app, the on-disk package tree the components
live in, and the orchestrator that owns their processes, ports and memory.

The evidence picture is unambiguous on language and narrow on shape. Rust is the
only language whose cost is zero on the dominant axis, which is the existing
eighteen-crate engine; the host is an addition of one crate plus a build script,
not a rewrite. The cohort of comparable products almost never ships one file that
is both the app and the CLI, and the one that does (Tailscale on macOS) does it by
environment sniffing. The component tree is already decided by the a2a
provisioning ADRs (`generations/<id>` immutable, `app-home/` mutable) and the
Python question is what fills it: bundling CUDA torch is ruled out by size at
every channel, while a stripped python-build-standalone interpreter plus uv-driven
provisioning is a shipping pattern in the closest analogues. Native identity has
one hard asymmetry: an unsigned macOS `.app` is worse UX than the current tarball
under Sequoia's Gatekeeper, so the bundle is only worth building once signing is
funded. Process supervision has no crate to adopt; the project already owns a
720-line containment module for one child that the orchestrator should generalize.
What the ADR must settle is listed at the end of the last finding.

## Findings

### F1 What is delivered, and what the vault already decided, bounds this decision

The runtime laws below the front door are delivered and stable, so the host does
not start from zero. `2026-07-12-single-app-runtime-adr` D1–D7 delivered the
machine-global seat lock and discovery file under `~/.vaultspec/`, the bare
`vaultspec` launch verb that detaches `serve` (`DETACHED_PROCESS` +
`CREATE_NO_WINDOW` on Windows, `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs:349`),
`stop`/`restart`/`status`/`update`, graceful shutdown, and CLI provisioning parity.
`2026-07-04-dashboard-packaging-adr` embedded the SPA into the binary via
`rust-embed` (`engine/crates/vaultspec-api/src/routes/spa.rs:23`) and chose
detect-and-instruct for the Python siblings, explicitly deferring "bundle uv and
bootstrap Python tools on first run" to a v2 and deferring a Tauri shell to a v3.
`2026-07-18-a2a-product-provisioning-adr` D1 defined the composite release unit
(dashboard executable, adjacent immutable a2a capsule, release-set manifest,
external updater, licences, SBOM), D3 a lifecycle plane with
`install/ensure/start/stop/restart/repair/update/rollback/remove/doctor`, and D4
"dashboard owns only the gateway process". `2026-07-24-a2a-product-provisioning-adr`
D1 made that capsule a dashboard-built PyInstaller onedir. `vaultspec-product`
implements the tree: `generations/<gen-id>/` immutable, `app-home/` mutable,
`transaction/`, `staging/`, `updater/` rooted at `<app home>/a2a`
(`engine/crates/vaultspec-product/src/paths.rs:14-24`), with a certified relocation
case (`engine/crates/vaultspec-product/src/bin/product_certify.rs:272`).

Three facts in that record are what this decision has to change rather than build
on. First, the composed tree is a2a-scoped: the WiX package header states "NO
AGENT-TO-AGENT RUNTIME IS PACKAGED ... adoption is declared but not implemented"
(`engine/crates/vaultspec-cli/wix/main.wxs:1-40`), and the MSI is never built
because `dist-workspace.toml:45` sets `installers = []`. Second, the packaging ADR's
detect-and-instruct posture and the `rag-integration` rule's "attach, never own"
posture are the direct opposite of an orchestrator that owns the siblings; both are
reviewed contract events, not refactors. Third, `engine/Cargo.toml:41` sets
`unsafe_code = "forbid"` workspace-wide, which any native-identity code touching
Win32, Cocoa or kqueue must respect by living in dependencies or in a separately
fenced crate.

Measured on this machine (2026-09-03): the release `vaultspec.exe` is 31.2 MB; a
`uv tool` install of `vaultspec-core` 0.1.73 is 132 MB; `vaultspec-rag` 0.4.22
without its `gpu` extra is 181 MB, and torch is declared only under
`extra == 'gpu'` (`torch>=2.4`, `sentence-transformers>=5.0`, `transformers>=4.51`
in `vaultspec_rag-0.4.22.dist-info/METADATA`); a second install carrying the `gpu`
extra measures 986 MB with torch at 498 MB. rag provisions its own Qdrant binary
into `~/.vaultspec-rag/bin/qdrant/<version>/qdrant.exe` (80 MB, versions 1.18.2 and
1.19.0 present) and its data directory holds 43 GB. Whether the base rag install
performs local embedding without torch was not investigated; it changes the rag
component's size by 5x and is the first check the plan must make.

### F2 Rust is the host language; Go, C++/Qt and Electron each fail on the rewrite or runtime axis

The cost of touching the engine dominates every other axis, and only the Rust
options leave it untouched. Go would either rewrite the eighteen crates or become a
thin supervisor that adds a second toolchain to CI while adding no capability Rust
lacks; its tray story (`fyne.io/systray`) needs `CGO_ENABLED=1` on macOS and
Windows, forfeiting cross-compilation exactly where it matters
(https://github.com/fyne-io/systray). C++/Qt brings a third language, a third build
system, an FFI boundary through a `forbid(unsafe)` workspace, and a dual licence
whose community and commercial editions may not be mixed in one project
(https://www.qt.io/licensing/); for a team with no native-GUI experience shipping in
weeks it is the highest-risk row. Electron 44.1.1 (2026-09-01, Chromium 152, Node
24.19, https://releases.electronjs.org/) would add a Node runtime and a second
browser engine of roughly 110 MB to a product whose SPA already runs in the user's
browser, and its `.app` cannot serve as the CLI; Jan is migrating off Electron
toward Tauri for size reasons (https://github.com/janhq/jan/issues/4485). Both
size figures are secondary-source claims (https://www.gethopp.app/blog/tauri-vs-electron)
and were not measured here.

Within Rust the field is two shapes, not two languages. **Plain Rust binary plus
system browser** is the status quo plus a build script: zero new runtime, zero new
toolchain, zero new CI legs; native identity is the weak axis and must be added by
hand (F4). **Rust plus a Tauri v2 host** adds a small crate that spawns the existing
binary as an `externalBin` sidecar and owns tray, single-instance and bundling;
Tauri core is actively released (2.11.0 on 2026-04-30 through 2.11.5 on
2026-07-01, https://tauri.app/release/core/), `app.windows` may legally be `[]` so
a process can boot with no webview (https://v2.tauri.app/reference/config/), and
its single-instance plugin forwards a second invocation's `argv` and `cwd` to the
running instance (https://v2.tauri.app/plugin/single-instance/). Its costs are
concentrated and testable in days: Linux needs WebKitGTK 4.1 plus
`libayatana-appindicator3` at runtime (https://v2.tauri.app/start/prerequisites/),
which the digest-pinned manylinux_2_28 build images in `dist-workspace.toml` do not
carry; whether a zero-window build still initializes the platform webview is
unverified (the literal headless request, tauri-apps/tauri#1061, is closed
unshipped); its updater covers MSI/NSIS, macOS tarball and AppImage only
(https://v2.tauri.app/plugin/updater/) and would be a second updater beside the
seat-locked `vaultspec-updater`; and `tauri-plugin-cli` documents that production
Windows apps "cannot write to the calling console by default"
(https://v2.tauri.app/plugin/cli/). Tauri is therefore the Ollama/Jan shape (a
host that supervises a sidecar engine) at the price of a GUI toolkit dependency the
product otherwise does not need.

### F3 One file that is both CLI and app is rare in the cohort, and Windows makes it structurally impossible to do cleanly

The cohort's dominant pattern is a small host beside a separate CLI. Ollama ships a
GUI process and a `ollama` CLI in one per-user directory on Windows
(`%LOCALAPPDATA%\Programs\Ollama`, no admin, https://docs.ollama.com/windows) and
on macOS puts the CLI at `Ollama.app/Contents/Resources/ollama` with an
admin-prompted symlink that users complain about
(https://github.com/ollama/ollama/issues/15521). Docker Desktop, Podman Desktop,
Jan and LM Studio all separate app and CLI; LM Studio's Electron app writes
`~/.lmstudio/bin/lms` and registers PATH via an explicit `lms bootstrap` verb
(https://lmstudio.ai/docs/cli). Zed ships a separate `cli` inside the bundle
(https://zed.dev/docs/reference/cli). uv, rustup and Deno are console-only with no
double-click story at all. The single exception is Tailscale on macOS, whose one
Mach-O at `Tailscale.app/Contents/MacOS/Tailscale` "goes into CLI mode when run
from a terminal" by sniffing `SHLVL`/`TERM`/`TERM_PROGRAM`/`PS1`, forceable with
`TAILSCALE_BE_CLI=1` (https://tailscale.com/kb/1080/cli), and whose symlink into
`/usr/local/bin` is a known hang (https://github.com/tailscale/tailscale/issues/2553).
The closest precedent is a heuristic, not a mechanism.

On Windows the reason is structural. Rust exposes exactly two subsystems
(https://rust-lang.github.io/rfcs/1665-windows-subsystem.html). A console binary
double-clicked from Explorer allocates a console that lives as long as the process;
the delivered launcher answers this by spawning `serve` detached and exiting within
a second (single-app-runtime D2), so the console flashes rather than persists. A
`windows` subsystem binary has no console before `main`, `cmd.exe` does not wait
for it so its output interleaves with the returned prompt, and the
`AttachConsole(ATTACH_PARENT_PROCESS)` trick cannot recover output emitted before
attach (https://learn.microsoft.com/th-th/windows/console/attachconsole,
https://github.com/rust-lang/rust/issues/101645). Single-app-runtime O4 already
rejected the dual-subsystem route for these reasons. What the cohort does instead is
the "two binaries" pattern: a tiny `windows`-subsystem launcher carries the icon and
version resource and `CreateProcess`es the console CLI. Because the product already
composes a tree with a second binary in it (`vaultspec-updater`), a third
component is nearly free in the MSI. On macOS and Linux the tension does not exist:
a `.app`'s `Contents/MacOS/<exe>` and a `.desktop` `Exec=` line can both point at
the console binary, which simply exits after detaching the seat.

### F4 Native identity is a build script on Windows and Linux, and a funded signing decision on macOS

Windows identity is a `build.rs` the crate does not yet have. `winresource` 0.1.31
(2026-03-16, https://crates.io/crates/winresource) generates VERSIONINFO from
`Cargo.toml` metadata plus an `.ico`; `embed-resource` 3.0.11 (2026-07-02, MSRV
1.76, https://crates.io/crates/embed-resource) compiles a hand-written `.rc` with
toolchain-detection resilience. Both are far below `rust-version = "1.96"`
(`engine/Cargo.toml:18`), and because the Windows leg is a native self-hosted runner
(`dist-workspace.toml`, `x86_64-pc-windows-msvc = "Windows"`) `rc.exe` from the SDK
is available and no MinGW path is needed. Without the resource, Explorer shows a
generic icon and a blank Details tab even when the MSI shortcut carries an icon;
shortcut icons and PE resources are separate mechanisms. MSIX is a dead end:
Windows refuses unsigned MSIX under every deployment path
(https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview).
Signing options have moved since the packaging ADR recorded zero budget: Azure
Artifact Signing (renamed from Trusted Signing) is generally available at USD 9.99
per month for 5,000 signatures, open to individuals via Entra Verified ID but
requiring organisations to be three years old
(https://azure.microsoft.com/en-us/pricing/details/trusted-signing/); SignPath
Foundation signs OSS projects with a public codebase and OSI licence for free
(https://signpath.org/terms.html). Current SmartScreen reputation thresholds could
not be pinned to a 2026 Microsoft source and stay unverified.

Linux identity is a `.desktop` entry (Desktop Entry Specification 1.5, 2020-04-27,
http://specifications.freedesktop.org/desktop-entry/latest/) with `Terminal=false`
and hicolor PNG icons, dropped by `packaging/install.sh` next to the extracted
tree. cargo-dist emits nothing for Linux but tarballs. AppImage carries a live FUSE
hazard: installing the `fuse` v2 package on Ubuntu 24.04 can remove
`ubuntu-session` (https://bugs.launchpad.net/ubuntu/+source/fuse/+bug/2083496).
Flatpak's sandbox is hostile to a tool that reads arbitrary repositories and spawns
`git` and `vaultspec-core`. The manylinux_2_28 glibc floor already pinned in
`dist-workspace.toml` is the strongest part of the Linux stack and any new Linux
leg must keep it.

macOS identity is asymmetric in a way that decides sequencing. A `.app` needs
`Info.plist`, `.icns` and `Contents/MacOS/`, which is roughly forty lines of shell in
CI; `cargo-bundle` 0.11.0 (2026-05-30) self-describes as very early alpha and Zed
uses a patched fork of it (https://github.com/burtonageo/cargo-bundle). Signing
and notarization require the Apple Developer Program at USD 99 per year, then
`codesign` with hardened runtime, `notarytool submit` on a zip or dmg container, and
`stapler` (https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).
Since macOS 15 Sequoia the Control-click bypass is gone: an unsigned `.app` forces
the user through System Settings → Privacy & Security → Open Anyway
(https://developer.apple.com/news/?id=saqachfa), whereas a bare Mach-O extracted by
`install.sh` typically carries no quarantine attribute and runs silently. An
unsigned `.app` is therefore strictly worse UX than the tarball the product ships
today; the bundle is only worth building once signing is funded. A `.app` can
also be the CLI (Tailscale, F3) or carry the CLI beside it (Zed, Ollama); the
user-writable `~/.local/bin` symlink avoids Ollama's admin prompt.

### F5 Only cargo-packager and the Tauri bundler carry sidecars; cargo-dist's role stays planning and hosting

The package must carry sibling binaries under an internal `bin/` and a resource
tree, and only two tools model that. cargo-dist 0.32.0 (2026-05-21) supports
exactly `shell`, `powershell`, `npm`, `homebrew`, `msi` installers, its MSI is
binary-only, and it has no `.app`, `.deb`, AppImage or sidecar concept
(https://axodotdev.github.io/cargo-dist/book/installers/index.html); its
`include` and `extra-artifacts` keys are the wrong shape, which is why
`dist-workspace.toml` already bypasses its installers. cargo-packager 0.11.8
(2025-11-27, crabnebula) emits NSIS and WiX on Windows, `.app` and `.dmg` on macOS,
`.deb`, AppImage and Pacman on Linux, and has first-class `external_binaries`,
`resources`, `icons` and `identifier`
(https://docs.rs/cargo-packager/latest/cargo_packager/config/struct.Config.html);
whether it can be driven against a pre-composed product tree rather than a cargo
target directory is unverified. The Tauri bundler (2.11.5) covers the same formats
plus `.rpm` with `externalBin` sidecars that must carry a `-<target-triple>`
suffix (https://v2.tauri.app/develop/sidecar/), at the cost of the whole Tauri
config surface. cargo-wix 0.3.9 (2025-03-13) has not released in eighteen months
but the product already owns its `main.wxs` and a `heat`-harvested licence
fragment. A hand-rolled CI step per OS is the option with unlimited control and is
what the MSI already is; the decision is whether to keep hand-rolling for `.app`
and `.desktop` too, or to adopt cargo-packager for all three.

### F6 The Python siblings are provisioned into the mutable home, not bundled; torch decides it

Bundling CUDA torch is ruled out at every channel by size, measured 2026-09-02
against torch 2.14.0 (https://pypi.org/pypi/torch/json): the Windows CPU wheel is
124 MB, the `cu130` wheel 1,991 MB and the `cu126` wheel 2,603 MB
(https://download.pytorch.org/whl/); the Linux PyPI wheel is 555 MB and links
separately shipped `nvidia-*` wheels (`nvidia-cudnn-cu12` 751 MB, `nvidia-cublas-cu12`
581 MB, `nvidia-cusparse-cu12` 366 MB, `nvidia-nccl-cu12` 342 MB, `triton` 248 MB)
for roughly 3 GB downloaded and 6–7 GB unpacked. The live torch 2.14 index set is
`cpu`, `cu126`, `cu130` only. Nobody in the cohort bundles it: ComfyUI Desktop
bundles the `uv` executable and downloads roughly 2.5 GB of dependencies at first
run in three to five minutes, with a configurable mirror for users who cannot reach
GitHub or PyPI (https://blog.comfy.org/p/easy-installation-in-desktop,
https://github.com/Comfy-Org/desktop); Open WebUI desktop downloads
python-build-standalone, sets up uv and installs its package on first run
(https://deepwiki.com/open-webui/desktop/1.1-getting-started); Jan moved the
inference engine out of the app into versioned downloadable backends under
`~/.local/share/Jan/data/llamacpp/backends/` with a CDN fallback
(https://www.jan.ai/docs/desktop/local-engine/llama-cpp); Stability Matrix
downloads embedded Git and Python on first run and keeps per-package venvs
(https://deepwiki.com/LykosAI/StabilityMatrix/5.2-python-virtual-environments).
Ollama is the counter-example, bundling roughly 1.6 GB of C++ GPU runtimes, a
smaller problem than a Python stack.

The interpreter itself is cheap enough to carry in the immutable tree.
python-build-standalone is Astral-maintained with ten releases between 2026-06-10
and 2026-09-01 (https://github.com/astral-sh/python-build-standalone/releases);
the `install_only_stripped` CPython 3.13.15 archives are 21.9 MB on Windows x64,
25.1 MB on macOS arm64, 34.8 MB on Linux x64 and 29.2 MB on Linux arm64, and expand
to roughly 70 MB (measured locally: a uv-managed 3.13.14 is 71 MB). Its one gotcha
is relocatability: build-time absolute paths in `_sysconfigdata`, Makefiles and
`PYTHON.json` must be rewritten
(https://github.com/astral-sh/python-build-standalone/blob/main/docs/quirks.rst),
which uv does at install time and the product's relocation certification already
covers for the a2a onedir. uv 0.12.8 (2026-08-31) exposes every flag an app-owned
lifecycle needs and they were verified locally: `uv python install --install-dir`,
`uv tool install --no-index --find-links <wheelhouse> --offline --python`, and the
directory variables `UV_PYTHON_INSTALL_DIR`, `UV_TOOL_DIR`, `UV_CACHE_DIR`,
`UV_TOOL_BIN_DIR`, `UV_PYTHON_INSTALL_MIRROR`, `UV_OFFLINE`
(https://docs.astral.sh/uv/reference/environment/). A fully offline install from a
staged wheelhouse plus a mirrored interpreter is therefore first-class, not a
workaround; a true portable venv remains open (https://github.com/astral-sh/uv/issues/15751).

The alternatives are dead or a trust downgrade. PyOxidizer's last release is 0.24.0
(2022-12-30) and its maintainer calls it "possibly dead"
(https://github.com/indygreg/PyOxidizer/issues/741). pyapp 0.29.0 (2025-10-15)
defaults to download-at-first-run, embeds only with `PYAPP_DISTRIBUTION_EMBED`, and
documents no integrity check (https://ofek.dev/pyapp/latest/config/distribution/),
which is below the TUF-verified posture `vaultspec-distribution-authority` already
enforces. PyInstaller 6.22.2 (2026-08-17) is the validated path for the a2a
capsule but a onedir containing CUDA torch would be the multi-gigabyte artifact
ruled out above, and PyInstaller binaries have crashed under macOS hardened
runtime (https://github.com/pyinstaller/pyinstaller/issues/4629). Nuitka was not
investigated.

The signing consequence of provisioning is smaller than it looks. macOS library
validation binds only in-process loading; a provisioned interpreter launched as a
subprocess, which is how every sibling is already invoked, is not subject to the
host's validation. Arm64 executables need at least an ad-hoc signature, so
provisioned binaries need `codesign -s -` or arrive signed. Both points are
general knowledge not verified against Apple primary documentation in this
session. Sparkle replaces the entire `.app` on update
(https://sparkle-project.org/documentation/bundles/) and axoupdater keys off a
receipt in the config directory (https://github.com/axodotdev/axoupdater), so
anything mutable must live outside `Contents/` and outside the installed tree,
which `generations/` plus `app-home/` already models; XDG conformance
(https://specifications.freedesktop.org/basedir/latest/, 0.8, 2021-05-08) would
put generations under `$XDG_DATA_HOME/vaultspec` and the journal under
`$XDG_STATE_HOME/vaultspec` rather than `~/.vaultspec`.

### F7 There is no supervisor crate; generalize the owned-gateway module, and accept the macOS holes

No Rust crate supplies restart-with-backoff, crash-loop detection, ordered
startup and teardown, or bounded log capture. `tokio::process` gives spawn and
wait only, and documents `kill_on_drop` as best-effort with no timing guarantee
(https://docs.rs/tokio/latest/tokio/process/struct.Command.html). `duct` 1.1.1
(2025-11-09) is a one-shot pipeline runner. `ractor` 0.16.5 (2026-08-07) supervises
actors, not OS processes; `bastion` 0.4.5 last released 2022-01-07. The project
already owns the containment layer for exactly one child: `engine/crates/vaultspec-product/src/process.rs`
(720 lines) spawns the a2a gateway as a process-group leader on unix with
SIGTERM-then-SIGKILL via `killpg`, into a job object on Windows via `command-group`,
issues a control-plane stop plan before the graceful window, and proves grandchild
cleanup with real processes. `command-group` 5.0.1 (2023-11-18) is formally
succeeded by `process-wrap` 10.0.0 (2026-08-24, same author,
https://crates.io/crates/process-wrap), which composes `JobObject`, `CreationFlags`,
`ProcessGroup`, `ProcessSession` and `KillOnDrop` over one `CommandWrap` with both
std and tokio frontends; it does not expose job-object memory limits and its
`JobObject` spawns `CREATE_SUSPENDED`, which interacts with the launcher's existing
creation flags.

Children dying with the parent has three mechanisms and one hole. Windows is
solved by `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, which survives a hard parent kill
because the handle closes with the process
(https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information),
provided breakaway stays off. Linux is solved by process group plus
`prctl(PR_SET_PDEATHSIG)` via `nix` 0.29, already a dependency. macOS has no
pdeathsig; the working substitute is kqueue `EVFILT_PROC | NOTE_EXIT` registered
from inside the child (https://github.com/oven-sh/bun/pull/29930,
https://jmmv.dev/2019/11/wait-for-process-group-darwin.html), which cannot be
injected into a Python child without a shim, so the honest macOS posture is
group-kill on graceful shutdown plus reconciliation from the discovery file on next
boot. Memory bounding is likewise asymmetric: Windows caps committed memory with
`JOB_OBJECT_LIMIT_JOB_MEMORY` (allocation fails, a completion port is notified);
Linux needs a delegated cgroup v2 `memory.max` (`cgroups-rs` 0.5.1, 2026-07-14,
https://crates.io/crates/cgroups-rs), which an unprivileged binary cannot create
without `systemd-run --user --scope`; macOS has no practical per-process cap,
`RLIMIT_DATA` failing with `EINVAL` below roughly 418 GB on arm64
(https://developer.apple.com/forums/thread/702803), so the only posture there is
admission control before spawn (`sysinfo` 0.39.6 is already a dependency) plus RSS
polling and a supervisor-issued kill. The `graph` rule bars CUDA, torch and wgpu
from engine crates, so a GPU presence probe (`nvml-wrapper` 0.13.0, 2026-08-31;
`wgpu` 30.0.1 adapter enumeration) needs its own fenced crate or an out-of-process
query, which is an ADR-level placement question.

Port allocation should let the child report, not the parent assign. Bind-zero,
read, close and pass is a documented race (https://eklitzke.org/binding-on-port-zero);
the `SO_REUSEADDR` reservation trick needs child cooperation and does not port to
Windows, where `SO_EXCLUSIVEADDRUSE` is the recommended primitive
(https://learn.microsoft.com/en-us/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse);
socket activation via `listenfd` 1.0.2 is unix-only. The cohort hardcodes (Ollama
`127.0.0.1:11434`, https://docs.ollama.com/faq) or walks upward (Jupyter). The
product's discovery file with port, bearer, pid and heartbeat is already the right
primitive; extended to a per-service block written after each child reports its
own bound port, the race becomes a child-side bind failure the supervisor retries
with backoff. Resident-service registration (systemd user unit, LaunchAgent,
Windows service) is a category change that moves ownership out of the binary and
breaks the `--no-seat`/`--port 0` contract; its only concrete gain is Linux cgroup
delegation. A tray icon from a tokio binary drags a platform event loop and, on
Linux, GTK into the process (`tray-icon` 0.24.2, https://docs.rs/tray-icon/latest/tray_icon/);
`ksni` 0.3.5 avoids GTK but is Linux-only and absent on stock GNOME. The cohort
evidence on "double-click and nothing visible happens" is Syncthing, which ships no
tray and whose users built SyncTrayzor and syncthingtray to fill the gap
(https://docs.syncthing.net/users/faq.html, https://github.com/canton7/SyncTrayzor/issues/659);
the three mitigations that ship are auto-open the browser (Jupyter's default, and
its own bug class, https://github.com/jupyter/notebook/issues/5361), a tray, or a
minimal native window. The launcher already does the first.

### F8 What the ADR must settle

The evidence favours a plain Rust host crate over a Tauri shell for the first
increment, provisioning over bundling for the Python siblings with the interpreter
carried and the packages provisioned, a two-binary launcher on Windows with the
console CLI as the `.app` and `.desktop` target elsewhere, hand-rolled per-OS
identity steps consistent with the owned MSI, and a supervisor generalized from the
owned-gateway module. It does not decide, and the ADR must: (a) whether the host is
a new crate that consumes the engine or the existing `vaultspec-cli` crate grown a
supervisor; (b) the package tree's root and naming on each OS, including XDG
placement and whether the a2a-scoped `<app home>/a2a` root generalizes to
`<app home>/components/<name>`; (c) which components are carried in the immutable
generation (interpreter, uv, qdrant, a2a onedir) and which are provisioned into it
at first run (core, rag packages, torch variant by GPU probe); (d) the supersession
of detect-and-instruct and of rag's attach-never-own rule, and how a foreign rag
service already running on the machine is treated; (e) the memory and port policy
per OS given the asymmetries in F7; (f) whether signing is funded, which sequences
the `.app` and the WinGet/Scoop/Homebrew channel gates; (g) whether cargo-packager
replaces the hand-rolled MSI or joins it; (h) where the GPU probe lives relative to
the `graph` rule's no-GPU-dependency law.

## Sources

- `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs:349` — detached launcher creation flags
- `engine/crates/vaultspec-api/src/routes/spa.rs:23` — rust-embed SPA
- `engine/crates/vaultspec-cli/wix/main.wxs:1-40` — product-tree MSI, a2a runtime absent by decision
- `dist-workspace.toml:45` — `installers = []`; runner and manylinux pins
- `engine/Cargo.toml:18` — `rust-version = "1.96"`; `:41` — `unsafe_code = "forbid"`
- `engine/crates/vaultspec-product/src/paths.rs:14-24` — generations/app-home layout
- `engine/crates/vaultspec-product/src/process.rs` — owned-gateway containment
- `engine/crates/vaultspec-product/src/bin/product_certify.rs:272` — relocation certification
- `vaultspec_rag-0.4.22.dist-info/METADATA` — torch under `extra == 'gpu'` (local uv tool install)
- https://github.com/nevenincs/vaultspec-dashboard/releases/tag/v0.1.12
- https://rust-lang.github.io/rfcs/1665-windows-subsystem.html
- https://learn.microsoft.com/th-th/windows/console/attachconsole
- https://github.com/rust-lang/rust/issues/101645
- https://crates.io/crates/winresource — 0.1.31, 2026-03-16
- https://crates.io/crates/embed-resource — 3.0.11, 2026-07-02
- https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview
- https://azure.microsoft.com/en-us/pricing/details/trusted-signing/
- https://signpath.org/terms.html
- http://specifications.freedesktop.org/desktop-entry/latest/ — 1.5, 2020-04-27
- https://bugs.launchpad.net/ubuntu/+source/fuse/+bug/2083496
- https://github.com/burtonageo/cargo-bundle — 0.11.0, 2026-05-30
- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- https://developer.apple.com/news/?id=saqachfa
- https://axodotdev.github.io/cargo-dist/book/installers/index.html — 0.32.0, 2026-05-21
- https://docs.rs/cargo-packager/latest/cargo_packager/config/struct.Config.html — 0.11.8, 2025-11-27
- https://v2.tauri.app/develop/sidecar/ ; https://v2.tauri.app/plugin/single-instance/ ; https://v2.tauri.app/plugin/updater/ ; https://v2.tauri.app/plugin/cli/ ; https://v2.tauri.app/start/prerequisites/ ; https://v2.tauri.app/reference/config/ ; https://tauri.app/release/core/
- https://github.com/tauri-apps/tauri/issues/1061
- https://releases.electronjs.org/ — 44.1.1, 2026-09-01
- https://github.com/janhq/jan/issues/4485
- https://www.qt.io/licensing/
- https://github.com/fyne-io/systray
- https://www.gethopp.app/blog/tauri-vs-electron — secondary, unverified sizes
- https://docs.ollama.com/windows ; https://docs.ollama.com/faq ; https://github.com/ollama/ollama/issues/15521
- https://tailscale.com/kb/1080/cli ; https://github.com/tailscale/tailscale/issues/2553
- https://lmstudio.ai/docs/cli ; https://zed.dev/docs/reference/cli
- https://pypi.org/pypi/torch/json — 2.14.0, 2026-09-02; https://download.pytorch.org/whl/
- https://pypi.org/pypi/nvidia-cudnn-cu12/json and sibling `nvidia-*` / `triton` packages
- https://github.com/astral-sh/python-build-standalone/releases — 20260901
- https://github.com/astral-sh/python-build-standalone/blob/main/docs/quirks.rst
- https://docs.astral.sh/uv/reference/environment/ ; local `uv 0.12.8 (2026-08-31)` help output
- https://github.com/astral-sh/uv/issues/15751
- https://github.com/indygreg/PyOxidizer/issues/741
- https://ofek.dev/pyapp/latest/config/distribution/ — 0.29.0, 2025-10-15
- https://github.com/pyinstaller/pyinstaller/issues/4629 — 6.22.2, 2026-08-17
- https://blog.comfy.org/p/easy-installation-in-desktop ; https://github.com/Comfy-Org/desktop
- https://deepwiki.com/open-webui/desktop/1.1-getting-started
- https://www.jan.ai/docs/desktop/local-engine/llama-cpp
- https://deepwiki.com/LykosAI/StabilityMatrix/5.2-python-virtual-environments
- https://sparkle-project.org/documentation/bundles/ ; https://github.com/axodotdev/axoupdater
- https://specifications.freedesktop.org/basedir/latest/ — 0.8, 2021-05-08
- https://docs.rs/tokio/latest/tokio/process/struct.Command.html
- https://crates.io/crates/process-wrap — 10.0.0, 2026-08-24 ; https://github.com/watchexec/command-group
- https://crates.io/crates/ractor — 0.16.5 ; https://crates.io/crates/bastion — 0.4.5 ; https://crates.io/crates/duct — 1.1.1
- https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information
- https://github.com/oven-sh/bun/pull/29930 ; https://jmmv.dev/2019/11/wait-for-process-group-darwin.html
- https://developer.apple.com/forums/thread/702803
- https://crates.io/crates/cgroups-rs — 0.5.1, 2026-07-14
- https://crates.io/crates/sysinfo — 0.39.6 ; https://crates.io/crates/nvml-wrapper — 0.13.0 ; https://crates.io/crates/wgpu — 30.0.1
- https://eklitzke.org/binding-on-port-zero ; https://learn.microsoft.com/en-us/windows/win32/winsock/using-so-reuseaddr-and-so-exclusiveaddruse ; https://crates.io/crates/listenfd — 1.0.2
- https://docs.rs/tray-icon/latest/tray_icon/ — 0.24.2 ; https://crates.io/crates/ksni — 0.3.5
- https://docs.syncthing.net/users/faq.html ; https://github.com/canton7/SyncTrayzor/issues/659 ; https://github.com/jupyter/notebook/issues/5361

Unverified general-knowledge claims, flagged in place: Electron and Tauri binary
sizes; SmartScreen reputation thresholds; macOS library-validation scope and the
arm64 ad-hoc signature requirement; whether a zero-window Tauri build initializes
the platform webview; whether cargo-packager accepts a pre-composed tree; whether
base `vaultspec-rag` embeds locally without torch.
