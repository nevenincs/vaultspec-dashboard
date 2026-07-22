---
tags:
  - '#research'
  - '#a2a-product-provisioning'
date: '2026-07-18'
modified: '2026-07-21'
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

### Active receipt durability needs a fixed journal

The current `Receipt::persist` implementation writes a process-named temporary
file, changes its permissions, and renames it over `receipt.json`, but it does
not synchronize the file or its containing directory. This is atomic against a
concurrent pathname reader, not separately durable across a crash. It also lets
staged and rolling-back records occupy the active-selection path.

A fixed two-slot journal is the smallest bounded design that preserves one
complete prior active receipt while publishing the next. Both slots have fixed
size; in an accepted steady state each is empty or contains a settled complete
active-receipt envelope, and an empty slot never selects a generation. Only the
inactive target covered by durable proof may transiently be partial or malformed.
Publication overwrites that exact slot range, synchronizes the journal, reopens
it without following aliases, and validates the exact envelope and closed
receipt grammar. Candidate and interruption state remains separate from active
selection.

Three fixed logical proof replicas in the same journal record activation
progress without creating or deleting another pathname. Each logical replica
uses two alternating subrecords, so a transition writes only the older
subrecord and a tear leaves the currently selected proof intact. Recovery first
synchronizes and reopens the journal, then resolves the higher valid transition
sequence inside each logical replica. A state requires a two-of-three byte-
identical valid quorum; transitions normalize all three logical replicas before
target mutation or ordinary selection proceeds. Equal-sequence disagreement,
absence of a proof quorum, sequence overflow, unproved damage to a newer slot,
aliases, or growth fail closed. The active proof identifies the retained
journal, prior slot and envelope, exact target slot and sequence, target
preimage or empty marker, and intended envelope digest. While active proof
remains, an unchanged preimage, empty target, or partial-invalid target
preserves the proved prior slot; an exact intended target must be synchronized
and exactly reopened before all proof replicas retire in place and the new slot
can win. Any third complete valid envelope fails closed. Ordinary highest-
sequence selection cannot authorize syntactically valid but unsettled bytes.

The local toolchain is Rust `1.96.0` (`ac68faa20`), and the locked relevant
dependencies are `rustix 1.1.4`, `tempfile 3.27.0`, `fs4 0.13.1`, and
`same-file 1.0.6`. Safe standard and locked dependency APIs cover file
synchronization and Unix containing-directory synchronization, but they do not
provide a documented safe Windows containing-directory durability contract.
`tempfile::persist` explicitly does not synchronize file contents or the
containing directory. Rust's Windows rename may use `MoveFileExW` or
`SetFileInformationByHandle` without a write-through promise.

Safe stable Rust also does not expose the Windows hard-link count needed to
reject a pre-aliased authority file. The D9 wrapper already queries the exact
retained handle through `GetFileInformationByHandleEx` for full-width
`FILE_ID_INFO`; the same bounded Win32 call with `FileStandardInfo` returns
`FILE_STANDARD_INFO.NumberOfLinks`. A narrow safe `link_count` observation is
therefore the minimum honest way to enforce D10's alias rejection. It adds no
generic native query surface and requires real NTFS tests that observe one
link, add a hard link, observe two, and reject a journal whose alias predates
the guarded read.

Windows unpublished-generation authority has a separate directory gap. The
current implementation creates by pathname and reopens afterward, retains no
directory handle, and uses `same-file`'s reduced Windows identity. Safe
`CreateDirectory` followed by pathname reopen cannot prove that the created
object was not substituted between those operations. The minimum exact
primitive is handle-relative `NtCreateFile` with
`OBJECT_ATTRIBUTES.RootDirectory`: an owned non-reparse parent handle opens or
exclusively creates one validated child component and atomically returns the
owned child handle. The wrapper must fix directory-only, synchronous,
open-reparse-point options and exact `FILE_OPEN` or `FILE_CREATE` dispositions;
query type, reparse state, delete-pending state, and full `FILE_ID_INFO` from the
returned handle; allow only read sharing so write and delete access remain
denied while retained; and clean up only through that exact handle. Successful
cleanup is a terminal consuming transition that
marks the empty directory and closes its authority; failure returns the still-
owned authority with the operating-system error. Its safe surface accepts no
arbitrary `Path`, raw handle, generic access flags, or native buffer, and real
NTFS tests must prove substitution/rename denial, parent-relative
disambiguation, exclusive create, reparse rejection, nonempty cleanup failure,
and exact empty cleanup.

Microsoft documents `MOVEFILE_WRITE_THROUGH` as waiting for a move to reach
disk and specifically guarantees flushing a copy-and-delete move. That is the
available narrow first-install primitive, but documentation alone does not
certify same-volume NTFS power-loss behavior. The Windows authority wrapper may
therefore expose only the reviewed same-directory operation, and release
certification must still exercise real NTFS virtual-machine power cuts. Native
NTFS, APFS, and ext4 power-loss evidence is distinct from child-process kill
tests; the latter prove state-machine ordering, not storage durability.

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
- Rust `std::fs::rename` platform behavior:
  https://doc.rust-lang.org/std/fs/fn.rename.html
- `tempfile::NamedTempFile::persist` durability caveat:
  https://docs.rs/tempfile/3.27.0/tempfile/struct.NamedTempFile.html#method.persist
- Windows `MoveFileExW` and `MOVEFILE_WRITE_THROUGH`:
  https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw
- Windows buffered-I/O flushing contract:
  https://learn.microsoft.com/en-us/windows/win32/fileio/flushing-system-buffered-i-o-data-to-disk
