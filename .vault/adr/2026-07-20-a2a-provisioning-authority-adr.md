---
tags:
  - '#adr'
  - '#a2a-provisioning-authority'
date: '2026-07-20'
modified: '2026-07-20'
related:
  - "[[2026-07-20-a2a-provisioning-authority-research]]"
  - "[[2026-07-20-a2a-distribution-trust-adr]]"
  - "[[2026-07-18-a2a-product-provisioning-adr]]"
  - "[[2026-07-20-a2a-generation-authority-adr]]"
---

# `a2a-provisioning-authority` adr: `sealed activation and dashboard credential authority` | (**status:** `accepted`)

## Problem Statement

S11 is the integrated authority proof between exact unpublished-generation verification
and receipt-selected lifecycle use. Its current passing test does not traverse that
chain. It uses diagnostic manifest joins and the retired `receipt.json` writer, while
the product selects only the fixed active-receipt journal.

The production boundary is also incomplete. No sealed operation joins authenticated
distribution metadata, the exact installation guard, retained unpublished generation,
complete release verification, dashboard credential bootstrap, and durable receipt
publication. Exposing the raw private inputs would let candidate values manufacture
their own authority.

Credential code has a parallel authority defect. One unrestricted Rust store can create
all three roles even though the separate Python gateway owns worker interprocess-
communication credential creation. Secret bytes land before Unix permissions are
restricted, Windows restriction is a no-op, and readers follow arbitrary paths with
unbounded reads. The receipt's bootstrap-ownership fact is currently a caller-supplied
boolean rather than proof of retained credential files.

This decision supplies the sealed product transaction and credential authority needed
by D3, D5, D8, and D10. It refines the accepted product-provisioning, distribution-trust,
and generation-authority decisions without superseding them.

## Considerations

- Raw `TrustedReleaseAuthority`, `VerifiedReleaseSet`, active receipt constructors,
  journal handles, and publisher functions remain private.
- Candidate trust begins only with an opaque TUF-verified distribution release.
- The same retained installation guard and exact unpublished-generation authority must
  remain borrowed through complete verification and publication.
- First install creates ownership and attach-control as one recoverable transaction and
  commits authority only when the fixed receipt settles.
- Receipt facts are derived from retained authority, not caller-selected flags, paths,
  generation names, or copied identities.
- Install channel and manager ownership come from a sealed adapter capability, not a
  caller-selected `Channel` enum; those facts control later mutation authority.
- The Rust product owns dashboard bootstrap credentials only. The packaged Python gateway
  reads those credentials and creates worker IPC per gateway boot.
- Credential creation, reads, cleanup, subprocesses, diagnostics, and recovery state are
  bounded and use real operating-system objects.
- Windows credential security must stay in safe Rust unless real tests prove the existing
  retained-file and ACL dependencies cannot establish the required protected state.
- The cooperative same-user and installation-lock threat model remains honest on Unix;
  no pathname cleanup claims to defeat a malicious same-user final-check race.

## Considered options

- **Keep S11 as a legacy integration test - rejected.** It would certify APIs that active
  selection no longer reads and would leave the production transaction absent.
- **Publish raw verification and receipt inputs - rejected.** Public raw fields or a
  digest-filled bootstrap descriptor recreate candidate self-authorization.
- **Put activation directly on `VerifiedReleaseSet` or `LockedProduct` - rejected.**
  Either leaves credential and recovery ordering outside the boundary or overloads a
  filesystem-authority type with the complete provisioning state machine.
- **Use caller-selected dashboard and gateway actor labels - rejected.** A label is
  self-asserted and cannot enforce process ownership. A Rust gateway store would duplicate
  a Python-owned responsibility.
- **Rely on final permissions or profile inheritance - rejected.** Unix write-then-chmod
  exposes a transient secret, and arbitrary Windows inheritance is not an owner-private
  guarantee.
- **One sealed provisioning transaction plus dashboard-only credential authority -
  chosen.** It preserves private construction, orders every authority transition, and
  gives product consumers one production path.

## Constraints

- `VerifiedDistributionRelease` comes only from the accepted TUF boundary. No public
  function accepts expected target, member digest, cohort digest, component-lock bytes,
  capsule root, or signing root as independent caller fields.
- `ProvisioningTransaction` is non-cloneable and non-serializable. Its constructor derives
  product paths and requires the retained installation guard; no client path operand is
  accepted.
- `InstallProvenanceAuthority` is non-cloneable and constructed only by product-owned
  self-install or package-manager adapters. Raw public channel construction is unavailable.
- A prepared activation uniquely owns or borrows the distribution, generation,
  credential, transaction, and receipt authorities needed to finish or retry. No success
  path releases one early.
- The public active-release observation is read-only and non-authorizing. It exposes
  absent, settled facts, or recovery-required state through bounded getters, never a
  writable receipt or journal handle.
- Dashboard credential storage derives from `ProductPaths`. Arbitrary-path creation is
  unavailable. Foreign attach handoff is a separate creation-free reader.
- Credential tokens are exactly 64 lowercase hexadecimal bytes. Whitespace normalization,
  empty input, growth, alternate alphabets, and trailing bytes are rejected.
- Credential directories and files have fixed names and counts. Recovery residue is
  bounded by one bootstrap descriptor and the two dashboard credential files.
- The fixed active receipt is the authorization commit point. Complete credentials with no
  settled receipt remain inert.
- S170, S172, S163, the TUF ADR, and the D9 safe Windows authority crate are stable parents.
  S11 remains open until this decision is implemented and independently reviewed.

## Implementation

**D1: A sealed transaction is the sole activation path.** A
`ProvisioningTransaction` binds product-derived paths, the retained installation guard,
the owner-private bootstrap/update descriptor, fixed-journal state, and one sealed
`InstallProvenanceAuthority` from the active channel adapter. Preparing a release consumes
or uniquely borrows one opaque `VerifiedDistributionRelease` and one exact
`UnpublishedGeneration`. The transaction constructs private manifest verification inputs,
performs complete release verification, and retains the verified result. Receipt channel
and manager-ownership facts derive from the adapter capability; callers cannot label a
self-install as MSI, Scoop, WinGet, or another manager-owned channel.

Commit consumes the prepared release through the fixed S172 publisher. Success returns
an owned non-authorizing summary. Failure classifies refusal, recovery-required, or
indeterminate state and retains every exact generation, journal, installation,
credential, and descriptor authority needed for bounded retry or authorized cleanup.
No path, handle, raw digest, or writable receipt escapes.

**D2: Active selection has one sealed read facade.** `LockedProduct` exposes one
read-only active-release operation over the private fixed-journal reader. Its capability
remains non-cloneable and tied to the product lock. Consumers observe only absent,
settled, or recovery-required state. S16 holds the settled capability through lifecycle
selection. S164 verifies the receipt-selected generation through product methods that
derive trust from receipt and TUF state, never from a candidate lock or legacy receipt.

**D3: Rust owns only dashboard credentials.** Replace the generic credential store with
a dashboard store derived from `ProductPaths`. It can begin bootstrap, read ownership,
read attach-control, and return the non-secret attach reference. It has no worker-IPC
creation method and no generic role creator.

The packaged Python gateway reads the dashboard-created attach and ownership files and
creates its own worker-IPC token per boot. Rust tests that need worker behavior launch the
real capsule gateway rather than minting a gateway credential in dashboard code.

**D4: Foreign handoff is creation-free.** A separate handoff reader accepts a discovery
reference only for reading. It performs the same retained, no-follow, owner/access-policy,
type, identity, single-link, size, and exact-token checks as the dashboard reader. It
cannot create, replace, repair, or delete a foreign file. Lifecycle routes no longer call
raw `read_to_string` on discovery paths.

**D5: Credential files are secure before bytes arrive.** On Unix, retain the credentials
directory, require current-user ownership and mode `0700`, and create each final name with
descriptor-relative create-new, no-follow, close-on-exec, read/write flags and mode
`0600`. Revalidate type, owner, mode, identity, and one link before writing. Write exactly
one token, synchronize the file and directory, then bounded-reread the same handle.

On Windows, first replace and validate the empty credentials-directory discretionary
access-control list as protected and inheritable for only the current user, LocalSystem,
and built-in Administrators. Create each empty final file with existing retained
`AuthorityFile` create-new authority. Through its exact handle, remove inherited or
unexpected entries, install the protected three-principal file list, and revalidate before
writing secret bytes. Synchronize and same-handle reread afterward. Exact cleanup uses
delete-on-close authority, never a later pathname.

The existing safe `windows-acl` handle API and `AuthorityFile` are the default. If real
tests show they cannot establish the protected list while the object is empty, work stops
for a separate D9 amendment and unsafe review; product code does not improvise native
calls.

**D6: Pending credentials prove receipt facts.** Bootstrap returns a non-cloneable
`PendingDashboardCredentials` bound to the installation guard and both retained files.
Its cleanup authority remains armed. First-install activation consumes that proof and
derives `bootstrap_created_ownership`; no activation context accepts the boolean.

An update uses a retained `VerifiedOwnershipCredential` and can never claim bootstrap
creation. Receipt success disarms pending cleanup only after synchronized journal commit,
close, reopen, and settled reread. Publication failure preserves the pending proof with
the other S172 authorities.

**D7: Bootstrap is a durable recoverable transaction.** Under the installation lock,
publish and synchronize one owner-private descriptor before creating credentials. It
binds the verified distribution identity, sealed install provenance, intended receipt,
credential-role token digests, and exact observed file identities but contains no secret
value.

Create, harden, synchronize, and reread both dashboard credential files; verify the
complete generation; publish the active receipt last; then retire the descriptor and
disarm cleanup. Recovery reacquires the lock and classifies descriptor, files, and receipt
together. It resumes only exact matching pending state, preserves ambiguous or substituted
occupants, and never regenerates one member of a settled pair silently.

**D8: S11 is a real integrated proof.** Replace the diagnostic and legacy seams with the
sealed production transaction over a real TUF repository, complete generation, fixed
journal, credential files, and cross-process installation lock. Keep one settled active
generation plus real unpublished and fallback neighbors and prove only the receipt selects.

The proof covers manifest and TUF refusals, generation substitutions and aliases, secure
credential collisions and malformed reads, bootstrap interruption recovery, zero receipt
mutation on refusal, fixed-journal reopen, bounded lock contention, and child cleanup.
Every child has capped output, a fixed readiness and exit deadline, and kill-and-reap
cleanup on all paths.

## Rationale

S170, S172, and S163 already supply strong component authorities; S11 failed because no
production operation composed them. A sealed transaction preserves those authorities
without widening raw visibility and gives later lifecycle and installer code one ordered
entry point.

The credential split follows the actual process topology. Dashboard Rust creates the two
product-owned credentials; the separate A2A gateway already reads them and owns worker
minting. Removing the duplicate Rust creator turns that deployment fact into an API
boundary.

Pending credential authority closes the caller-supplied receipt boolean and makes the
fixed journal the single visible commit point. Retained secure files close both the
pre-permission Unix window and the Windows inheritance assumption. A durable descriptor
is necessary because the operating-system lock disappears on process death.

## Consequences

- First install and update gain one sealed bridge from authenticated distribution
  metadata to a settled active receipt.
- Candidate self-authorization remains impossible through the public API; raw trust and
  publication internals stay private.
- Lifecycle and API consumers gain a bounded active-release capability and can retire
  compatibility with legacy `receipt.json` and candidate-only verification.
- Dashboard, gateway, and worker credential responsibilities match the shipped Rust and
  Python process boundary.
- Credential creation and reads become materially more complex because they retain exact
  file and directory authority, enforce access policy, and carry recovery state.
- Bootstrap needs a durable descriptor and interruption matrix; the installation lock
  alone no longer appears sufficient.
- Existing Rust call sites and tests using arbitrary `CredentialStore` paths or
  `create_worker_ipc` must migrate. Cross-product worker proof now requires the real A2A
  capsule.
- Windows ACL behavior becomes a five-target certification gate. Failure of the safe
  dependency approach triggers a new ADR rather than a platform exception.
- Unix cleanup remains cooperative against the same user; ambiguous residue is preserved
  and reported rather than deleted.
- S11's scope expands beyond one integration test to production provisioning,
  credentials, receipt integration, active selection, platform authority use, and real
  process evidence. The system step remains open until all of that passes formal review.
