---
tags:
  - '#research'
  - '#a2a-provisioning-authority'
date: '2026-07-20'
modified: '2026-07-20'
related:
  - "[[2026-07-18-a2a-product-provisioning-adr]]"
  - "[[2026-07-20-a2a-generation-authority-adr]]"
  - "[[2026-07-18-a2a-product-provisioning-research]]"
---

# `a2a-provisioning-authority` research: `sealed provisioning facade and bounded credential authority`

## Problem and scope

S11 is the integrated proof after retained generation verification and durable receipt
publication. Its current test still exercises diagnostic manifest joins and the retired
`receipt.json` seam. It cannot construct or publish the lifetime-bound verified release
that D10 requires.

The same test names Rust values `dashboard` and `gateway`, but both use one unrestricted
`CredentialStore`. This naming does not enforce D5's actor split. The real gateway is a
separate Python process and already owns worker credential creation.

This research compares the smallest authority surfaces that close those gaps. It also
examines secure credential creation, crash recovery, and bounded real-process evidence.
It does not redesign release signing, channel adapters, or the later lifecycle plane.

S11 cannot remain scoped to one integration test. A test cannot supply a missing
production transaction boundary without exposing raw authority or adding test-only
construction paths. The step must include the production facade, credential authority,
platform file operations, and its real-behavior acceptance test.

## Evidence matrix

| Concern                     | Current evidence                                                                                                                                                                            | Decision consequence                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete manifest authority | `manifest.rs:568-583` labels capsule-to-lock verification as non-activation authority. `manifest.rs:857-885` labels the release result unverified and diagnostic.                           | S11 must enter through `VerifiedReleaseSet`, not the compatibility parsers.                                                                                |
| Trusted verification input  | `manifest.rs:1336-1372` keeps trust anchors and activation facts opaque. Their fields have no public constructor.                                                                           | Making those fields public would restore candidate self-authorization. A sealed facade must construct them.                                                |
| Exact generation authority  | `generation.rs:416-430` retains a non-cloneable `UnpublishedGeneration`. The generation-authority ADR requires the exact root through publication.                                          | The facade must consume the retained token. It must not accept a generation path or copied identity.                                                       |
| Durable selection           | `receipt.rs:11` calls `receipt.json` a temporary compilation seam. `receipt/publish.rs:1084-1094` consumes `VerifiedReleaseSet` through a crate-private publisher.                          | S11's legacy `Receipt::activate` test proves neither D10 publication nor durability.                                                                       |
| Inert fallback              | `product_authority.rs` imports no generation authority. Existing S163 evidence covers an absent journal, not an active generation with unpublished neighbors.                               | S11 needs one settled active generation and at least one real unpublished fallback that never selects.                                                     |
| Credential actors           | `credentials.rs:149-213` exposes `bootstrap`, `create_worker_ipc`, and `read_ownership` on one public type. `RoleForbidden` has no construction site.                                       | The Rust API does not enforce dashboard-only or gateway-only authority.                                                                                    |
| Receipt ownership fact      | `ReceiptActivationContext` accepts `bootstrap_created_ownership` as a boolean and publication copies it into the settled receipt. No production constructor proves the corresponding files. | First-install activation must derive this fact from retained pending credential authority, never from a caller-supplied boolean.                           |
| Real gateway ownership      | `vaultspec-a2a@d0639f6:src/vaultspec_a2a/desktop/credentials.py:create_worker_ipc_credential` creates worker IPC. `api/app.py:166-188` invokes it during gateway boot.                      | Rust should not expose a gateway worker-credential creator. The capsule owns that credential and its rotation.                                             |
| Unix credential creation    | `credentials.rs:233-238` writes secret bytes before applying mode `0600`. Reads use unbounded `read_to_string` and `trim`.                                                                  | Final metadata does not close the pre-restriction read window or bound hostile input.                                                                      |
| Windows credential creation | `credentials.rs:249-259` performs no Windows restriction. The manifest verifier already reads effective discretionary access-control lists through `windows-acl 0.3.0`.                     | Profile inheritance alone is not a derived owner-private guarantee. Creation must begin under a validated private parent and revalidate the retained file. |
| Process evidence            | `product_authority.rs:750-849` spawns a real lock holder. Timeout panic paths can leave it alive, inherited output is uncapped, and the crash mode loops without its own deadline.          | S11 needs a reusable deadline guard that kills and reaps on every exit path.                                                                               |
| Cross-process exclusion     | The focused target passes 23 cases, including a real second-process lock hold and reacquisition.                                                                                            | Preserve this proof. Strengthen the child process identifier and cleanup assertions.                                                                       |

## Rejected and current seams

### Retired receipt and diagnostic manifest APIs

Keeping S11 on `Receipt::mark`, `Receipt::activate`, and immediate reload is rejected.
The legacy writer uses a temporary pathname and rename without the D10 fixed journal,
proof replicas, retained identity, or synchronized reopen. A green test would certify a
surface that active selection no longer reads.

Keeping manifest tests on `verify_against_lock` is also rejected. Those methods detect
useful pin skew, but they do not join installed bytes, an external cohort, or exact
generation authority. The positive S11 fixture even supplies a synthetic component-lock
digest that differs from the committed lock while the diagnostic join succeeds.

### Public raw authority constructors

Publishing `TrustedReleaseAuthority` fields, receipt construction fields, or the fixed
journal writer is rejected. It lets a caller copy expected values from the candidate.
It also permits receipt publication without the unique generation loan.

### Internal-only acceptance

Moving S11 into crate-private unit tests is rejected. Existing unit tests already prove
the parts. D8 requires one production consumer path over real files, processes,
receipts, and locks. An internal fixture does not establish that usable path.

### Test-only escape hatches

Feature-gated constructors, failure injectors, and synthetic receipt writers are
rejected. They would make the test pass through a surface that installers cannot use.
They would also violate the project's real-behavior test rule.

## Options for a sealed provisioning facade

### Option A: expose the current authority types

This option makes verification inputs and receipt publication public. It is small, but
it breaks D10's private construction rule. It also forces every installer consumer to
rebuild ordering, retry, and recovery logic. Reject this option.

### Option B: add `activate` to `VerifiedReleaseSet`

A consuming activation method would preserve the generation lifetime. It still leaves
first-install trust construction, credential bootstrap, journal observation, and crash
recovery outside one boundary. Consumers could perform those steps in different orders.
Reject this option as incomplete.

### Option C: add one product-owned provisioning transaction

A sealed `ProvisioningTransaction` is the strongest fit. Construction requires the
exact `InstallLockGuard`, product-derived paths, and one retained `LockedProduct` loan.
It accepts a bounded bootstrap transaction descriptor, not raw candidate claims.

The descriptor supplies independently sourced target, member digest, cohort digest,
component-lock bytes and digest, capsule root, channel, time, and ownership intent. The
facade derives the generation identifier from `UnpublishedGeneration`. It constructs the
private manifest inputs, verifies the complete generation, and consumes the result in
the fixed publisher.

The facade returns a bounded non-authorizing observation: absent, settled with selected
facts, or recovery required. It never returns a writable receipt, raw journal handle,
or reusable verified release. This option preserves the sealed internals and gives
installers one ordered production operation. Recommend this option.

### Option D: place activation directly on `LockedProduct`

This option also keeps raw authority private. It mixes generation inventory, release
trust, credential bootstrap, transaction recovery, and receipt publication in one
existing type. That type currently models filesystem authority, not the whole install
state machine. Keep it as the facade's authority input rather than expanding its role.

## Options for the credential actor surface

### Option A: pass an actor enum

A caller-selected `Dashboard` or `Gateway` enum records intent but grants authority by
self-assertion. It cannot prove which process invoked the method. Reject this option.

### Option B: expose dashboard and gateway Rust store types

Separate Rust types can remove methods from each role. The gateway cannot consume its
type because the shipped gateway is Python. A Rust gateway type would duplicate the
real owner and preserve a misleading worker-creation path. Reject this option.

### Option C: keep only dashboard credential authority in Rust

Rust should expose a product-derived dashboard store. It bootstraps ownership and
attach-control, then reads those roles through bounded validation. It has no worker-IPC
creation method and does not expose a generic role creator.

The Python gateway reads attach-control and creates worker IPC through its capsule-owned
implementation. The worker credential remains confined to gateway-worker traffic and
may rotate per gateway boot. Recommend this option.

Dashboard-owned paths and foreign handoff paths are distinct authority surfaces. The
dashboard store must derive its directory from `ProductPaths`; it must not accept an
arbitrary minting path. A separate creation-free handoff reader may accept the discovery
reference only after retained no-follow, owner, permission, identity, link-count, size,
and token validation. This replaces the lifecycle route's current unbounded
`read_to_string` of a foreign reference.

The cross-language contract still fixes three distinct names and roles. Rust lifecycle
comments and tests must stop claiming that dashboard bootstrap wrote worker IPC.

## Secure Unix and Windows credential files

### Unix creation and reads

Three approaches are available:

- Write then call `set_permissions`. This creates a pre-restriction window and is
  rejected.
- Use `OpenOptionsExt::mode(0o600)` with `create_new(true)`. This prevents replacement
  and never requests group or other access. It remains pathname-based beneath a mutable
  parent.
- Use retained directory authority with `openat`, `CREATE|EXCL|NOFOLLOW|CLOEXEC`, and
  mode `0600`. This binds creation to the validated credentials directory and matches
  existing Unix authority practice. Recommend this option.

Write exactly 64 lowercase hexadecimal bytes through the retained file. Synchronize and
reread the same handle before publishing receipt authority. A read accepts only a
regular, single-link file owned by the effective user, with mode `0600`, exact bounded
length, and exact token grammar. It does not call `trim` or perform an unbounded read.

The credentials directory must remain a retained owner-owned directory with mode
`0700`. A name collision, link, unsupported type, owner drift, mode drift, growth, or
identity change fails closed.

### Windows creation and reads

Relying only on user-profile inheritance is rejected. `ProductPaths::under_app_home`
supports isolated roots, and an inherited access-control list can include broader
principals than D5 permits.

The lowest-expansion option hardens and validates the empty credentials directory first.
An exclusively created empty file then inherits that private discretionary
access-control list. Only an empty directory or file may pass through a transient list;
secret bytes arrive after the final list validates.

`windows-acl 0.3.0` exposes handle-based list enumeration plus access-control-entry
addition and removal. Its internal apply path includes
`PROTECTED_DACL_SECURITY_INFORMATION`, but it exposes no one-call constructor for a
complete list. Establishing the list therefore requires a focused source and behavior
proof: add the required current-owner and system entries, remove every disallowed entry,
then reload and compare the effective complete list. The directory entries must carry
the required inheritance flags before any child is created.

After exclusive empty-file creation, repeat that sequence through
`ACL::from_file_handle` on the retained `AuthorityFile`. Revalidate the complete
protected list before writing secret bytes. If the dependency cannot establish this
exact state without a broader transient entry, it is validation-only and cannot close
the creation contract.

After writing, synchronize and bounded-reread the retained handle. Require a regular
non-reparse file, link count one, stable full-width identity, exact token grammar, and an
effective access-control list limited to the current owner and required system
principals. The existing `AuthorityFile::create_prepared`, `file_mut`, `link_count`, and
`mark_delete_on_close` operations provide most exact-handle mechanics.

Adding an explicit-security-descriptor create operation to the Windows authority crate is
a separate D9 expansion. It becomes necessary if the safe dependency cannot establish
the exact protected list while the retained file is still empty. That choice needs an
ADR amendment and independent unsafe review.

## Transaction and recovery question

The filesystem cannot atomically create two credential files and the fixed receipt.
D3's atomicity must therefore mean one visible commit point. The settled active receipt
is that point. Consumers require both validated dashboard credentials and the matching
settled receipt; no unpublished generation or partial credential set authorizes startup.

Sequential file creation is safe under the installation lock only when receipt
publication happens last. The lock does not survive process death, so it cannot describe
durable recovery. The accepted design already requires an owner-private bootstrap
transaction descriptor. No production implementation exists yet.

The credential creator returns a non-cloneable `PendingDashboardCredentials` bound to
the installation guard and retained credential files. First-install activation consumes
that proof and derives `bootstrap_created_ownership`; no public activation context accepts
the receipt bit as data. A failed receipt publication returns or retains the pending
credential authority for bounded retry or exact cleanup. An update instead requires a
validated existing-ownership proof and can never claim bootstrap creation.

The descriptor needs one idempotency identity and bounded phases. It binds intended
release trust, credential roles, observed exact file identities after creation, and the
intended receipt. It contains no secret value. Each phase synchronizes its file and
containing directory before advancing.

Recovery reacquires the installation lock and resolves these states:

1. If the receipt is settled, validate both dashboard credentials and retire descriptor
   residue. Missing or invalid credentials require recovery; they never trigger fallback.
1. If no receipt is settled and the descriptor names two exact valid files, resume
   generation verification and receipt publication.
1. If a credential is partial or invalid, open its current occupant exactly. Delete or
   quarantine only after role, owner, identity, and descriptor revalidation.
1. If neither receipt nor descriptor exists, unclaimed credential residue grants no
   authority. Fail closed until an exact recovery policy classifies it.
1. If receipt publication returns retained verified authority, use the existing bounded
   retry path before releasing the transaction.

Crash recovery must never regenerate one credential while retaining the other silently.
It must not publish a receipt that asserts ownership retention before both files pass
same-handle validation.

## Recommended direction

Adopt a sealed product provisioning transaction and keep its raw manifest, generation,
and receipt authorities crate-private. The facade should own bootstrap descriptor
parsing, secure dashboard credential creation, complete release verification, fixed
receipt publication, bounded retry, and settled observation.

Bind first-install receipt facts to the opaque pending credential authority and derive
the ownership-created bit internally. Publication success disarms pending cleanup only
after the settled journal reread; failure preserves the exact authority. Never accept a
caller-selected ownership boolean.

Keep worker-IPC authority in the Python gateway. Replace the generic Rust credential
store with a product-derived dashboard surface. Reject caller-selected actor labels and
remove the unused `RoleForbidden` promise.

Use retained no-follow exclusive creation on Unix. On Windows, secure the credentials
directory before creating empty retained files, then set and verify access control before
writing secrets. Both platforms use bounded exact-grammar reads and same-handle checks.

Expand S11 beyond `tests/product_authority.rs`. The minimum honest scope includes the
new provisioning facade and crate export, private manifest construction helpers,
dashboard credential authority, required platform authority support, and the integrated
test. Update the S11 record after the production contract is proven.

The acceptance proof should create a complete real generation, activate it through the
facade, reopen the fixed journal, and retain an unpublished fallback. It should prove the
fallback remains inert, legacy receipt state cannot select, credential roles remain
separate, and a real bounded child process holds the install lock.

## Unresolved risks

- The bootstrap descriptor's distribution source and authentication are not yet defined.
  Candidate bytes cannot supply their own expected digests.
- `windows-acl 0.3.0` protects each applied list, but its sequential add/remove surface
  lacks a one-call whole-list constructor. Real tests must prove the final directory and
  file lists before this option is accepted.
- Credential repair after a settled receipt needs policy. Silent regeneration may break
  a live gateway, while permanent refusal may make repair impossible.
- First-install receipt and credential durability still need real power-loss evidence.
  Process termination cannot certify local New Technology File System durability.
- The Python gateway's secure attach-control read and worker-credential creation need
  cross-repository contract tests against the packaged capsule commit.
- The process-test deadline guard must kill and reap on panic, timeout, and early return.
  Captured output needs a hard byte cap.
- The public settled observation must remain non-authorizing. It cannot become a second
  receipt construction or mutation surface.
