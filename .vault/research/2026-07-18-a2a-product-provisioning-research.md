---
tags:
  - '#research'
  - '#a2a-product-provisioning'
date: '2026-07-18'
modified: '2026-07-18'
related:
  - "[[2026-07-04-dashboard-packaging-adr]]"
  - "[[2026-07-08-distribution-channels-adr]]"
  - "[[2026-07-07-project-provisioning-adr]]"
  - "[[2026-07-12-single-app-runtime-adr]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
---

# `a2a-product-provisioning` research: `shipping the complete A2A backend with the dashboard`

This research asks how the dashboard can ship a complete Agent-to-Agent (A2A)
backend through every supported product channel. It combines directed Vaultspec
discovery, full source inspection, official packaging documentation, and real
artifact and process experiments at dashboard commit `63162dee` and A2A commit
`db7400a`.

## Findings

### Existing distribution paths do not carry A2A

The dashboard distributes a Rust executable with an embedded single-page
application (SPA) through Cargo Dist 0.32.0. A2A remains an attach-never-own
Hypertext Transfer Protocol (HTTP) integration, so no installer provisions or
manages its runtime.

A real `dist plan` and Windows archive build confirmed that every target archive
contains only the executable, `README.md`, `LICENSE`, and `CHANGELOG.md`. The
Windows Installer (MSI) package's only application file payload is the
executable; its other components create integration such as `PATH`, shortcut,
and registry entries. The release
setup stages only the SPA at `.github/release-build-setup.yml:5-24`, and the
custom WiX tree declares only `vaultspec.exe` as an application file at
`engine/crates/vaultspec-cli/wix/main.wxs:88-189`.

Cargo Dist `include` can add a capsule to archives, but generated shell and
PowerShell installers move only declared binaries and libraries. MSI requires
explicit WiX components. Extra artifacts remain separate downloads. A complete
product therefore needs product-owned composite installation on top of Cargo
Dist's release orchestration.

The current Scoop manifest extracts the target archive but exposes only the
executable as a command; the archive contains no A2A payload. No WinGet manifest
exists. `cargo-binstall` and `cargo install` have no sidecar ownership or
component-receipt contract, so they cannot represent the composite product.

### The Python wheel is not a deployable runtime

The clean A2A wheel built successfully at 1,047,997 bytes with 447 entries, but
it cannot start a file-backed gateway. Startup exits with code 3 because
`alembic.ini` remains outside the wheel. The default Claude Agent Client
Protocol (ACP) provider fails because repository `node_modules` is absent, and
the alternative package-local binary directory does not exist.

The wheel also includes 191 test-related archive entries and the worktree's
untracked preset. This inventory reflects the source tree rather than a
controlled production closure. Exact package and runtime locators are recorded
in the related Reference.

The dependency graph also blocks the five-target release matrix. Intel macOS
cannot resolve Torch for CPython 3.13. On Windows, the inspected development
environment occupies 3.28 GiB, including 2.74 GiB for Torch. Production code
does not import Torch or `vaultspec-rag`; A2A launches retrieval-augmented
generation (RAG) separately through
`uvx` at `src/vaultspec_a2a/providers/_acp_mcp.py:32-59`.

### Live behavior lacks a safe lifecycle boundary

Real gateways bound to `0.0.0.0` and accepted unauthenticated `/v1` reads and
administrative shutdown. Discovery published the gateway-worker token. Two
gateways sharing one A2A home started concurrently and alternated overwriting
the same discovery record.

The top-level health endpoint reported ready while `/v1/service` reported the
same gateway degraded. Boot reconciliation started a worker before run demand,
and unauthenticated shutdown left that worker listening on Windows. These
results require loopback binding, separate credentials, one readiness model,
exclusive ownership, and manager-owned process-tree cleanup.

The remaining findings frame a candidate architecture for the architecture
decision record (ADR) to evaluate; they are not an already-governing decision.

### The evidence favors an adjacent immutable capsule

The favored product unit is one target-specific opaque capsule adjacent to the
dashboard executable. It contains private CPython 3.13, the locked A2A runtime,
migrations, presets, Node.js 22, and pinned ACP 0.59.0. A release-set manifest
binds dashboard, A2A, Python, Node, ACP, protocol, state-schema, digest, license,
and software-bill-of-materials identities.

In the candidate ownership model, the dashboard owns only the gateway. The
gateway owns its worker and launches it on first run demand. Run-scoped
authoring and harness Model Context Protocol (MCP) processes plus provider
processes remain per-run children; the independently invokable standalone MCP
adapter remains a separate surface.
SQLite is mutable product data. PostgreSQL and Jaeger remain server-profile
infrastructure, while VidaiMock remains certification-only. RAG stays a
separate capability and never re-enters the A2A base dependency closure.

System Python, runtime `uv` downloads, and Docker Desktop fail offline product
ownership. Python freezers would require replacing existing
`sys.executable -c` and `sys.executable -m` subprocess contracts. Embedding the
capsule inside the Rust executable preserves binary-only channels but enlarges
the binary and couples independent rollback. Bun compilation remains a later
optimization because the proven runtime path uses Node.js and platform-specific
ACP dependencies.

### Composite installers need product ownership

Cargo Dist should remain the release orchestrator, not the composite installer.
Each target build should produce a product tree containing the executable,
capsule, release manifest, licenses, and software bill of materials.

Product-owned shell and PowerShell installers should install and verify the
whole tree. MSI should consume a generated WiX component fragment. Scoop should
install the complete ZIP, and WinGet should reference the complete MSI. Bare
Cargo channels should remain unsupported until they can maintain the same
release set and receipt.

The dashboard needs a lifecycle plane separate from `/ops/a2a`. It should
manage bounded install, ensure, start, stop, restart, repair, update, rollback,
remove, and doctor jobs. The run broker should retain its fixed A2A verbs.

### Ownership, readiness, and update form one contract

An operating-system lock must serialize owned lifecycle changes. Discovery
must identify the endpoint, process ID (PID), install identity, generation, release set,
protocol, state schema, and owner without exposing secrets. Dashboard control
and gateway-worker interprocess communication (IPC) require separate
owner-restricted token files.

Authenticated `/v1/service` should establish compatibility and readiness.
Installed but stopped is a cold, startable state. A gateway with a cold worker
is ready because the worker starts lazily. Compatible foreign gateways may be
attached but never stopped, migrated, updated, repaired, or removed by the
dashboard.

Updates require a drain barrier, state snapshot, candidate staging, digest
verification, compatible migration, atomic receipt activation, restart, and
authenticated probe. Failure restores the prior capsule, receipt, and state
snapshot. The run broker should mint actor tokens only after readiness succeeds
and revoke them when dispatch fails or the run ends.

Lifecycle work must enforce a hard admission bound and atomic single-flight by
component identity. The current job registry can exceed its nominal capacity
when all entries run and separates its conflict check from insertion at
`engine/crates/vaultspec-api/src/routes/provision.rs:724-741` and `:925-956`.

### Wave 0 defines the proof boundary

Acceptance tests must inspect and execute real release payloads on all five targets.
The matrix covers clean and offline installation, relocation, the default ACP
provider, cold gateway startup, lazy worker startup, concurrent ensure,
authenticated control, singleton ownership, compatible foreign attachment,
tamper detection, drain, migration, update, rollback, interruption recovery,
repair, removal, and channel parity.

Tests must import production code and use observable files, sockets, processes,
and artifacts. Fakes, mocks, stubs, patches, monkeypatches, `skip`, and `xfail`
cannot certify the product boundary.

### Sources

- Dashboard distribution and lifecycle sources at commit `63162dee`
- A2A runtime and packaging sources at commit `db7400a`
- Cargo Dist 0.32 configuration:
  https://github.com/axodotdev/cargo-dist/blob/v0.32.0/book/src/reference/config.md
- Cargo Dist 0.32 MSI behavior:
  https://github.com/axodotdev/cargo-dist/blob/v0.32.0/book/src/installers/msi.md
- uv managed Python distributions: https://docs.astral.sh/uv/concepts/python-versions/
- python-build-standalone distribution model:
  https://gregoryszorc.com/docs/python-build-standalone/main/distributions.html
- Node.js 22 release artifacts: https://nodejs.org/download/release/latest-v22.x/
- Bun standalone executables: https://bun.sh/docs/bundler/executables
