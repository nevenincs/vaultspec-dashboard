---
tags:
  - '#adr'
  - '#a2a-product-provisioning'
date: '2026-07-18'
modified: '2026-07-21'
related:
  - "[[2026-07-18-a2a-product-provisioning-research]]"
  - "[[2026-07-18-a2a-product-provisioning-reference]]"
  - "[[2026-07-04-dashboard-packaging-adr]]"
  - "[[2026-07-08-distribution-channels-adr]]"
  - "[[2026-07-07-project-provisioning-adr]]"
  - "[[2026-07-12-single-app-runtime-adr]]"
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-07-20-a2a-archive-materialization-adr]]"
  - "[[2026-07-20-a2a-distribution-trust-adr]]"
---

# `a2a-product-provisioning` adr: `the dashboard-owned A2A companion and composite release set` | (**status:** `accepted`)

## Problem statement

The dashboard presents Agent-to-Agent (A2A) orchestration as a product feature,
but every shipped channel still installs only the dashboard executable and its
embedded single-page application (SPA). The current edge can attach to an
independently prepared gateway; it cannot install, authenticate, own, update,
repair, roll back, or remove the runtime on which the feature depends. A clean
A2A wheel is not that runtime: it omits migration and provider assets, assumes
repository-local Node.js dependencies, carries an unsuitable dependency
closure, and cannot satisfy the five-target release matrix.

This record decides the dashboard-side product boundary. A2A becomes a required
companion distributed in the same release set as the dashboard, while retaining
the accepted Hypertext Transfer Protocol (HTTP)-only orchestration edge and
keeping A2A-internal execution under A2A authority. It also closes the live
ownership failures found by the
related Research: broad binding, unauthenticated control, secret-bearing
discovery, competing gateways, inconsistent readiness, eager worker startup,
orphaned process trees, and non-atomic lifecycle jobs.

## Considerations

- The dashboard remains the sole user-facing application and frontend wire
  origin. No browser surface calls A2A directly, and the fixed `/ops/a2a`
  namespace remains an orchestration run broker rather than a package manager.
- The installed unit must work offline after installation without Docker
  Desktop, system Python, a runtime `uv` download, or repository-local
  `node_modules`.
- The release matrix is the five configured targets: Apple Silicon macOS,
  Intel macOS, Arm64 Linux, x86-64 Linux, and x86-64 Windows. Every applicable
  supported channel must install the same logical release set.
- The principal dashboard executable remains a single seated application. Its
  product ownership may extend only to A2A installation state and processes;
  the engine still never writes project vault documents or mutates git.
- The A2A gateway, worker, Model Context Protocol (MCP) adapters, provider
  processes, and SQLite state have different lifetimes. Treating them as one
  always-resident process would waste resources and blur cleanup authority.
- SQLite is desktop product data. PostgreSQL and Jaeger are server-profile
  infrastructure, VidaiMock is certification-only, and retrieval-augmented
  generation (RAG) remains an independently managed capability outside the A2A
  base dependency closure.
- The backend must serve frontend lifecycle state in the shared tiers envelope.
  Every job, queue, process, output stream, and wait must be
  bounded at creation.
- Compatible gateways started by another owner must remain attachable. Product
  ownership cannot license the dashboard to mutate a foreign installation or
  process.

## Considered options

- **An adjacent, target-specific immutable capsule in one composite release set
  — chosen.** It gives the product a private, reproducible runtime while keeping
  the Rust executable and Python/Node payload independently inspectable,
  stageable, and repairable. Activation and rollback still select one complete
  compatible release-set receipt; the option costs larger artifacts and a
  composite installer.
- **Embed the entire companion in the Rust executable — rejected.** It preserves
  a literal one-file payload but substantially enlarges the executable, couples
  two rollback domains, and makes component verification and repair harder.
- **Install the Python wheel into system Python or a user-managed virtual
  environment — rejected.** Interpreter, migration, Node.js, provider, and
  offline guarantees remain outside product ownership.
- **Download Python, A2A, or Agent Client Protocol (ACP) assets with `uv` on
  first run — rejected.** The result is network-dependent and mutable, and a
  partial acquisition cannot be an
  atomic product install.
- **Require Docker Desktop and the server Compose topology — rejected.** It
  introduces an external daemon and ships PostgreSQL, Jaeger, and test services
  that the desktop profile does not require.
- **Freeze A2A into a Python single executable — rejected for this release.**
  Existing worker and provider contracts invoke `sys.executable` modules and
  snippets; adopting a freezer would first require an A2A-internal process-model
  redesign.
- **Compile the provider adapter with Bun — deferred.** It may shrink the later
  capsule, but Node.js 22 plus pinned ACP 0.59.0 is the currently proven path.
- **Let Cargo Dist installers and bare Cargo channels remain the product
  boundary — rejected.** Current generated installers retain declared binaries
  and libraries only, the Windows Installer (MSI) package's only application
  file payload is the executable, and Cargo has no component receipt or
  sidecar lifecycle contract.

## Constraints

- The capsule is opaque to dashboard business logic. The dashboard may verify
  its release manifest and invoke its stable entrypoint, but it must not import
  Python packages or interpret A2A's internal module layout.
- A release-set manifest must bind target, dashboard build, A2A build, CPython,
  Node.js, ACP, protocol, state-schema, file digests, licenses, and software bill
  of materials. Mutable state and credentials never live inside the immutable
  capsule.
- The lifecycle manager requires a short-lived operating-system installation
  transaction lock, distinct from the gateway's lifetime-held runtime singleton. A
  dashboard may recover its own stale generation, but it may not stop, migrate,
  repair, update, roll back, or remove a compatible foreign gateway.
- Lock ordering is global: the controller acquires the installation transaction
  lock first. When its owned gateway is live, it authenticates, drains, stops,
  and waits for runtime-singleton release. When the installation is stopped or
  the recorded process is dead, it proves absence and quarantines only
  owner-matching stale state. The gateway never acquires or waits on the
  installation lock. The controller holds that lock through activation or
  rollback.
- Discovery and readiness must be authenticated and versioned. Discovery may
  publish endpoint, process identifier, owner, install identity, generation,
  release set, protocol, state schema, and a credential-file reference protected
  by the owner's operating-system access-control list (ACL), but no bearer
  value. A foreign dashboard without access to that
  handoff may discover the gateway but must refuse attachment.
- Dashboard control credentials and gateway-worker interprocess credentials are
  separate owner-restricted files. Loopback is the only desktop bind surface.
- Job admission is a hard bound: when no completed record can be evicted, the
  manager refuses another mutation. Conflict detection and insertion occur in
  one critical section, and the single-flight identity is the A2A component,
  not the requested operation label.
- Update is a state transaction, not an executable swap. Migration may proceed
  only when the staged release declares compatible protocol and state-schema
  transitions and a restorable snapshot group exists for the primary database,
  checkpoint database, and every other mutable schema-bearing store. A store may
  be excluded only when the release manifest declares and proves it derivable.
- The accepted packaging, project-provisioning, single-app-runtime, and A2A-edge
  parents are implemented and stable enough to extend. Their binary-only
  payload, Cargo-channel, attach-never-own, pre-readiness token, and
  executable-only update clauses are deliberately amended in the Implementation
  section; their SPA
  embed, seat law, authoring boundary, fixed run verbs, and tiers contracts
  remain stable.
- This decision is a deliberate, narrow contract event against the binding
  read-and-infer boundary. It permits the engine to manage only the
  product-owned A2A install tree, app home, receipts, and gateway through the
  lifecycle plane. It does not permit general sibling control, new run verbs,
  project-vault writes, git mutation, or search semantics. Acceptance requires
  an atomically reviewed in-place amendment to `architecture-boundaries.md`.
  The architecture decision record (ADR) remains proposed until that amendment
  validates. Durable promotion through `vaultspec-codify` must wait until a full
  implementation and review cycle satisfies its durability criteria.
- Intel macOS dependency resolution and the uncontrolled wheel closure are
  release blockers, not waivable platform exceptions. The desktop dependency
  profile must exclude non-runtime Torch and RAG dependencies before the target
  matrix can pass.
- Project-owned Rust remains safe by default. The only exception authorized by
  this decision is the target-gated `vaultspec-windows-authority` crate defined
  by D9. No product policy, parsing, lifecycle sequencing, network behavior, or
  mutable business state may move into that exception boundary.

## Implementation

**D1: Composite release unit.** Each target build produces one product tree:
the dashboard executable, its adjacent immutable A2A capsule, a release-set
manifest, a target-specific external updater helper, licenses, and a software
bill of materials. The helper survives dashboard exit and never serves product
traffic. The capsule contains a private CPython 3.13 runtime, the locked desktop
A2A distribution, migrations, presets, Node.js 22, and ACP 0.59.0. RAG, Torch,
PostgreSQL, Jaeger, and VidaiMock are excluded from this base closure.
Installation stores immutable generations separately from the A2A app home,
where SQLite, workspaces, discovery, credentials, snapshots, logs, and receipts
remain mutable.

**D2: Cargo Dist orchestrates; product-owned installers compose.** Cargo Dist
continues to plan the target matrix, checksums, GitHub release, and generated
workflow, but it is not the composite installer. Product-owned shell and
PowerShell installers install and verify the complete product tree. MSI
consumes a generated WiX component fragment for every capsule file. Scoop
installs the complete Windows ZIP, and WinGet points to the complete MSI. Bare
`cargo-binstall` and `cargo install` are unsupported until they can preserve the
same release set, receipt, verification, update, and removal guarantees.

Every installer writes channel provenance into the release receipt.
Self-installed copies let the external updater helper own file activation and
rollback. Package-manager-owned copies use a two-phase adapter: the product
helper performs preflight, drain, snapshot, and post-install verification, while
the manager alone stages, activates, and rolls back manager-owned files. On a
failed probe, the helper invokes the adapter's declared manager downgrade or
transaction rollback before it restores mutable state and the prior receipt. A
channel without a proven reversible adapter is not a supported update channel.

The product-owned scripts replace the generated Cargo Dist shell and PowerShell
installers, and the product-owned WiX source replaces the generated binary-only
MSI. Stale binary-only installers are neither published nor presented as
supported artifacts. This also amends WinGet from the earlier portable-ZIP
contract to the complete product MSI.

This composite archive shape and installer-verification delegation are later
refined by the canonical ZIP profile in
[[2026-07-20-a2a-archive-materialization-adr]] and the isolated TUF helper in
[[2026-07-20-a2a-distribution-trust-adr]]; neither refinement supersedes this
decision.

**D3: One lifecycle plane, separate from run control.** A dedicated lifecycle
registry follows the existing typed, job-shaped provisioning conventions and
exposes an A2A component lifecycle surface for
`install`, `ensure`, `start`, `stop`, `restart`, `repair`, `update`, `rollback`,
`remove`, and `doctor`. These operations never ride `/ops/a2a`; that namespace
keeps exactly its orchestration verbs. Lifecycle requests accept typed intent,
not free-form paths or arguments, and return backend-served state through the
normal tiers envelope.

First install requires a verified candidate release-set manifest and an
owner-restricted bootstrap transaction descriptor. That transaction atomically
creates the initial receipt and ownership capability. Every later mutation
requires the matching active receipt and receipt-bound ownership capability.

The component registry enforces a hard admission ceiling, time-to-live pruning
for completed records, capped output, bounded wall clocks, and atomic
single-flight across every mutating operation for the same installed component.
The installation transaction lock serializes mutations across dashboard processes.
Targets and install roots derive from product state, never client path strings.

**D4: Dashboard owns only the gateway process.** The seated dashboard starts
and stops a gateway only when its matching receipt and authenticated runtime
identity establish dashboard ownership. The gateway lazily starts its worker on first run demand
and owns worker cleanup. Authoring and harness MCP servers plus provider
processes stay run-scoped children. Stop and failure paths terminate the entire
owned process tree within a bound. Installed-but-stopped is a valid cold state;
a running gateway with a cold worker is ready.

The independently invokable standalone MCP adapter remains a separate surface.
The dashboard lifecycle neither launches nor adopts it.

A compatible foreign gateway may satisfy run demand through authenticated
attach only when discovery supplies an owner-ACL credential-file reference or
an equivalent one-time registration capability. Attachment is read-only from
the lifecycle plane. A gateway without that trusted handoff, or an incompatible
or unverifiable gateway, degrades the agent tier with remediation and is never
displaced speculatively.

Under the installation transaction lock, the matching receipt owner may
quarantine stale discovery only after proving the recorded process dead. A live
foreign or unverifiable resident remains immutable.

**D5: Authenticated, versioned discovery and readiness.** The desktop gateway
acquires a lifetime-held runtime singleton before it binds loopback or publishes
discovery. Discovery is atomically published and owner-restricted. It contains
no secret. It identifies endpoint, process, owner, install identity,
generation, release set, protocol, state schema, and the non-secret trusted
handoff reference. A separate dashboard control token authenticates gateway
control. A distinct token authenticates gateway-worker traffic.
Receipt-bound lifecycle operations, including shutdown,
also require an ownership capability that is never referenced by discovery;
the attach credential alone cannot invoke them. Liveness requires a live
process and fresh heartbeat. Compatibility and readiness require an
authenticated, versioned service probe.
The dashboard and A2A expose one readiness model rather than contradictory
health summaries.

**D6: Transactional update, rollback, repair, and removal.** For a
self-installed copy, the seated dashboard stages the candidate. For every
channel, it copies the current external updater into an owner-restricted
transaction directory outside the active release set and launches that copy
with a one-time transaction descriptor. On self-installed copies the helper may
replace both the dashboard and installed updater after they exit on Windows.

Recorded 2026-07-21: the receipt's bootstrap-ownership fact is structurally
underivable. It exists only as PROVEN — requiring a live retained credential
proof that revalidates through its own handles at the moment of assertion — or
as CARRIED, which can only transport what a prior settled receipt recorded.
There is no boolean path into either, so an update cannot mint a first-install
claim.

The updater acquires the installation transaction lock first. If the owned
gateway is live, the updater blocks new runs and drains active runs within a
bound. It authenticates and stops the gateway, then waits for its runtime
singleton and descendants to exit. If the gateway is absent or dead, the
updater proves that state and quarantines only owner-matching stale discovery.
It requests dashboard exit and waits for the seated executable to terminate.
The gateway never waits on the installation lock.

With no old-generation process accessing mutable stores, the updater snapshots
the primary and checkpoint databases plus every other schema-bearing store as
one consistency group. For package-manager copies it then invokes the declared
adapter so the manager stages manager-owned files without committing the
product receipt. The updater verifies the complete candidate before file
activation. The manager activates manager-owned files; the helper activates
self-installed files. The updater performs only declared compatible migrations
and atomically commits a complete release-set receipt. It relaunches the seat
and probes both dashboard and A2A readiness while holding the installation lock.
A one-time activation handoff lets the relaunched seat participate without
acquiring that lock.

Any failure stops the candidate. The updater invokes the channel's file rollback
authority and restores the prior receipt and snapshot group. It relaunches the
prior seat, waits for the seat-owned gateway, and probes both components before
releasing the lock. Interruption recovery resolves staged and active receipts
deterministically. A2A generations may be staged, verified, and
repaired independently, and a receipt may bind a new A2A generation to an
unchanged dashboard build. No capsule-only active receipt or rollback exists.
Repair never overwrites mutable state. Removal stops only owned processes and
removes installed generations while preserving or deleting data only through an
explicit typed choice.

**D7: Run admission follows readiness.** `/ops/a2a/run-start` distinguishes a
service-ready cold gateway from execution readiness. It starts or attaches to a
compatible gateway, ensures a ready worker, and confirms required provider
eligibility before creating role actors or issuing credentials. Per-role actor
tokens are minted only after those facts are authenticated and are revoked if
dispatch fails, when the run terminates, or when its bounded lifetime expires.
Token values never enter discovery, receipts, logs, lifecycle job output, or
frontend state.

**D8: Artifact-level certification is the release gate.** The release matrix
installs and exercises real product artifacts on all five targets and every
applicable supported channel. It covers clean and offline install, relocation,
default ACP execution, cold gateway and lazy worker behavior, singleton and
concurrent ensure, authenticated control, compatible foreign attach, tamper
detection, drain, migration, update, rollback, interrupted-update recovery,
owner-matching stale-record recovery, consistency-group restoration, repair,
removal, and channel payload parity. Tests import production code and
observe actual files, sockets, processes, receipts, and artifacts; fakes,
mocks, stubs, patches, monkeypatches, skipped cases, and expected failures do
not certify this boundary.

**D9: Isolated Windows operating-system authority boundary.** The workspace
continues to forbid unsafe code in the engine and product crates. Windows file
authority requires six primitives that the Rust standard library does not
expose as a complete safe contract: the full 128-bit `FILE_ID_INFO`, deletion
of the exact retained handle rather than a later pathname, the hard-link count
of an exact retained authority file, retained handle-relative directory
open/create/traversal and cleanup, positive process existence/identity
classification when ordinary enumeration is inconclusive, and write-through
installation of the first fully synchronized fixed active-receipt journal into
its final same-directory name.
The target-gated internal crate `vaultspec-windows-authority` is the sole
project-owned exception. It may wrap only the minimum Win32 calls required for
those primitives and the handle open/share modes that make them meaningful.

The exception is explicit in that crate's lint configuration. Unsafe calls are
confined to a private operating-system module immediately beside their safety
arguments; the rest of the crate denies unsafe code. Its public API exposes
only owned file and directory handles, copied identities and link counts,
exact-handle operations, bounded single-component directory child methods, a
bounded tri-state process observation, and one safe same-directory durable-
replace operation backed by `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` and
`MOVEFILE_WRITE_THROUGH`. That operation is restricted to installing a fully
synchronized regular non-reparse file, rejects cross-directory operands and
reparse or non-regular source and destination entries, and supplies no receipt
policy or authorization. It must not expose raw pointers or borrowed raw
handles, accept unbounded buffers, infer product ownership, or authorize a
mutation. Product code remains responsible for joining the operation to the
retained installation lock, app-home and journal identities, complete receipt
bytes, and post-install reread.

The crate pins `windows-sys` exactly and is owned by the product installation
authority. Every permitted operation requires real Windows tests for full-width
identity, retained-handle link counts and pre-existing hard-link rejection,
handle-relative directory disambiguation and exclusive child creation, reparse
rejection, share-denial behavior, exact empty-directory cleanup and honest
nonempty failure, live/dead/unverifiable process outcomes, write-through same-
directory replacement, and error propagation, plus warning-denied lint and an
independent source review of each unsafe call. The journal operation
additionally requires first-install
crash and real NTFS durability certification; process termination alone cannot
certify power-loss durability. An unverifiable process is live for mutation
authorization. This exception must be removed when the standard library or an
audited safe dependency supplies the same semantics; it cannot be cited to
introduce unsafe code into another crate or for another platform or subsystem.

Directory child traversal is the only permitted native relative-open surface.
It validates one bounded name component before FFI and uses the retained parent
as `OBJECT_ATTRIBUTES.RootDirectory` with fixed directory-only, synchronous,
open-reparse-point options, read-only sharing, and exact open-versus-create
disposition. The safe API exposes neither `NtCreateFile`, arbitrary paths,
access/share/create flags, nor native structures. Every returned child is
already retained and validated for directory type, non-reparse state, non-
delete-pending state, and full-width identity before product code can observe
it. Retention denies write and delete access so another handle cannot rename,
remove, or convert the authority into a reparse point. Exact cleanup marks only
that retained empty directory for deletion. It is a terminal consuming
transition: success closes the marked authority, while failure returns the
still-owned authority together with the operating-system error.

**D10: Active receipt authority is a fixed two-slot journal.** The sole active
selection record is one owner-private, fixed-size `active-receipts.v1` journal
under the product app home. It contains exactly two fixed-size slots. An empty
slot is permitted but never participates in selection; only one complete
settled `ActiveReceipt` envelope can be active. Each envelope has a format magic
and version, monotonically increasing `u64` sequence, bounded payload length,
SHA-256 payload digest, canonical complete receipt payload, and zero padding.
Only the inactive target slot named by valid durable transaction proof may be
transiently partial or malformed. Candidate, staged, rolling-back, and
interruption state never appears in either active slot; it lives only in
separately bounded transaction state. The journal also contains three fixed-
size logical replicas of a non-selection activation-proof record, each encoded
as two alternating fixed-size subrecords. Updating or retiring proof is an in-
place fixed-range operation and creates or removes no pathname.

The active payload has a closed grammar with private construction and binds the
dashboard version, commit, and digest; release-set identity and member-manifest
digest; component-lock digest; external exact-five-target cohort digest; target
and A2A identity; active generation; channel provenance; ownership-retention
fact; prior seat; consistency generation; schema version; and creation time.
Only a lifetime-bound verified complete release set under the retained
installation lock and exact unpublished-generation authority may construct it.

Under that authority, a reader validates the retained journal identity, fixed
size, both slot envelopes, canonical payload bytes, digest, closed receipt
grammar, and semantic bounds. With no transaction proof, the valid slot with
the highest sequence is active. Equal highest sequences with different bytes,
sequence overflow, an unproved malformed newer slot, aliases, growth, or
ambiguity fail closed.

Before the first byte of an inactive slot changes, an owner-private active-proof
record binds the retained journal identity; the prior authoritative slot index,
sequence, and envelope digest; the target slot; the exact next sequence; the
target slot's complete pre-write envelope digest or explicit empty marker; and
the intended complete envelope digest. Each subrecord carries its own magic,
format, transition sequence, state, length, and digest. Within one logical
replica, the valid subrecord with the higher transition sequence is selected;
equal-sequence disagreement invalidates that replica. A proof state exists only
when at least two of the three logical replicas independently resolve to byte-
identical valid records. No competing quorum is possible; absence of a quorum
fails closed.

Before proof bytes participate in recovery or authorization, the installation-
locked reader synchronizes the journal, closes it, reopens it without following
aliases, and revalidates its retained identity and fixed size. This settles any
parseable bytes left in the operating-system cache by a terminated writer
before they can form a quorum.

A proof transition positionally writes only the older or empty subrecord of one
logical replica, never its currently selected subrecord, then synchronizes,
closes, reopens, and validates that replica before advancing to the next. A torn
subrecord therefore leaves that logical replica's prior selected subrecord
intact. Target mutation cannot begin until all three logical replicas have been
normalized to the same active proof. While an active-proof quorum exists,
ordinary highest-sequence selection is suspended. An exact preimage or empty
target, or a partial-invalid target, retains only the proved prior slot as
active. An exact intended complete target must be synchronized, then the same
journal identity must be closed, reopened, and revalidated for exact bytes and
semantics before proof retirement begins. Retirement likewise advances one
logical replica at a time to one identical retired record with the next
transition sequence; ordinary target selection resumes only after all three
retired logical replicas synchronize and reread exactly. A crash during either
proof transition is recovered from the surviving quorum by normalizing the
minority logical replica under the installation lock. Any third complete valid
target envelope or any proof, journal, prior, authority, sequence, or digest
mismatch fails closed.

Steady-state publication overwrites only the older inactive slot, never the
current active slot: construct the entire bounded envelope in memory, revalidate
the retained journal identity, fixed size, and active-slot bytes, then
positionally overwrite exactly the inactive slot range without creating,
truncating, or resizing the journal. Synchronize the journal and revalidate its
identity, fixed size, untouched active-slot bytes, and exact target bytes before
the recovery sequence above may retire proof and authorize the target. First
installation creates and synchronizes a complete journal under one fixed same-
directory initialization name, installs that name durably, and rereads it. On
Unix this includes containing-directory synchronization; on Windows it uses
only D9's write-through wrapper and remains a release blocker until real local-
NTFS virtual-machine power-loss certification passes. A process crash before
first commit authorizes no generation; after a successful synchronized commit
it exposes the complete receipt. Residue is bounded to the journal plus one
initialization entry and never becomes active authority.

## Rationale

The related Research and Reference show that neither the dashboard archive nor
the A2A wheel is a complete deployable product. Live attach alone also does not
establish safe ownership. An adjacent capsule is the smallest boundary
that makes every runtime input immutable and offline while preserving A2A's
Python process model and permitting independent staging, verification, and
repair inside a complete release-set activation contract.
Keeping Cargo Dist as release orchestrator preserves the proven release matrix;
placing composition in product-owned installers addresses the demonstrated
archive, installer, and MSI payload gaps instead of depending on unsupported
Cargo Dist behavior.

Separating lifecycle from `/ops/a2a` preserves the accepted cross-repository
edge: one plane manages a product component, the other brokers runs. The
gateway-only ownership model follows actual process authority without making
the dashboard understand workers, MCP adapters, or providers. Authenticated
readiness, separate credentials, atomic ownership, and transactional update are
one contract because weakening any one reintroduces the observed races, secret
exposure, orphaning, or split-version state.

This decision partially amends the dashboard-packaging ADR by replacing the
binary-only installed payload and executable-only self-update with a composite
release set; the embedded SPA, principal executable, release gates, and
zero-budget signing posture stand. It partially amends the
distribution-channels ADR: Scoop now carries the complete ZIP, WinGet uses the
complete MSI, and the documented Cargo channel is withdrawn until composite
receipts are supported; its manifest-governance and staged-SPA decisions stand.
It extends, rather than replaces, project provisioning's typed bounded job
  substrate, while limiting direct product writes to the dashboard-owned install
  tree and app home. It never permits writes to a project vault or Git
  repository. It amends the
single-app-runtime update ordering: the seated process launches the external
updater and exits before file activation, and the seat and owned A2A component
advance as one release set. It partially amends the A2A orchestration-edge ADR's
attach-never-own and token timing clauses: compatible foreign attach remains,
owned installed gateways gain lifecycle management, and token issuance moves
after authenticated readiness. The five run verbs and HTTP-only authoring edge
remain unchanged. No related ADR is superseded as a whole.

## Consequences

- A dashboard installed through a supported channel has the complete A2A
  capability it presents; setup no longer depends on a source checkout,
  system interpreter, Docker, or first-run network acquisition.
- Release artifacts grow materially because they include CPython and Node.js.
  Build time, storage, antivirus scanning, license inventory, and release upload
  cost become permanent product concerns.
- Product releases now coordinate two repositories and multiple upstream
  runtimes through one immutable manifest. A stale or missing capsule blocks the
  release instead of degrading silently.
- Bare Cargo installation ceases to be a supported product channel. Existing
  users must migrate through a composite installer or package manager before
  receiving A2A.
- The dashboard gains a narrow sanctioned ownership exception: it may mutate
  only its A2A install generations, receipts, credentials, snapshots, and
  process tree. The existing architecture-boundaries rule must receive that
  narrow in-place amendment atomically with ADR acceptance. The exception cannot
  be cited to grow arbitrary sibling management. Later codification depends on
  evidence from a completed implementation and review cycle.
- Foreign compatible services remain useful for development and server
  operation, but their lifecycle is intentionally unavailable in the dashboard.
  Operators must use the foreign owner's controls.
- Update failures take longer because correctness requires drain, snapshot,
  migration, probe, and possible restore. In return, the dashboard never leaves
  a knowingly split dashboard/A2A release set active.
- The release gate becomes more expensive and platform-sensitive, especially on
  Intel macOS. Failure on any required target or applicable channel withholds
  publication. Metadata-only certification cannot replace artifact-level
  certification.
- Windows installation authority gains one small, target-gated unsafe review
  surface. In exchange, all consumers remain safe Rust and receive the exact
  file and process observations plus first-journal write-through installation
  needed to fail closed. Any expansion of that surface requires a new accepted
  ADR amendment and independent unsafe review.
- Active selection consumes a fixed amount of disk and has an explicit prior-
  slot recovery path. Transaction progress is a separate bounded journal and
  can never make an unpublished or interrupted candidate active. Native
  filesystem and virtual-machine power-loss certification become release
  evidence, not an inference from process-kill tests.
- The manifest and lifecycle boundary allow future capsule compaction, Bun
  adoption, or server-profile installers without changing `/ops/a2a`, provided
  they preserve the same ownership, compatibility, receipt, rollback, and
  certification contracts.
