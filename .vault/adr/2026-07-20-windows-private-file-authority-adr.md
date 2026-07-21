---
tags:
  - '#adr'
  - '#windows-private-file-authority'
date: '2026-07-20'
modified: '2026-07-21'
related:
  - "[[2026-07-20-windows-private-file-authority-research]]"
---

# `windows-private-file-authority` adr: `protected exact-handle authority for Windows private files` | (**status:** `accepted`)

## Problem Statement

The accepted provisioning authority requires each Windows credential and bootstrap file
to receive a protected, exact three-principal discretionary access-control list before
authority-bearing bytes are written. Recovery must later rewrite or retire the exact
retained bootstrap descriptor. Distribution rollback state requires the same protected
private-file property.

The preferred safe composition cannot currently satisfy that contract. `windows-acl`
0.3.0 marks every DACL it mutates as protected, but it cannot observe
`SE_DACL_PROTECTED`. Existing creation handles omit `WRITE_DAC`, while reopened reader
handles also omit the data-write and delete authority required by descriptor recovery.
Entry enumeration alone cannot distinguish a protected DACL from an equivalent-looking
unprotected DACL.

Product bootstrap and distribution persistence therefore fail closed on Windows. This
decision defines the smallest reviewed extension to the existing D9 boundary needed to
establish and verify private Windows files. It refines D9 of the accepted product-
provisioning decision and D5-D7 of the accepted provisioning-authority decision; it
supersedes neither.

## Considerations

- Product, distribution, API, CLI, and engine crates continue to forbid unsafe code.
- Every authority-bearing file is empty when its private DACL is established.
- Files are mutated and revalidated through the exact retained handle.
- Directory path operations retain directory identity and exclude rename or deletion.
- Protected state, inherited-entry absence, principals, masks, flags, identity, type,
  and link count are distinct facts and must all be verified.
- The fixed principal set is the current user, LocalSystem, and built-in Administrators.
- Creation, recovery, read-only observation, rewrite, and retirement require different
  rights and remain distinct Rust authority types.
- `windows-acl` remains the safe mutation layer once given a sufficiently authorized
  handle. (Amended 2026-07-21: validation-time entry enumeration moved out of
  `windows-acl` into the D3 snapshot; see the amended D3.)
- One bounded snapshot observation of DACL control and entries is the only new native
  security-descriptor primitive. (Amended 2026-07-21 from protected-state-only.)
- Real NTFS inheritance and close/reopen behavior are the acceptance boundary.
- Existing typed Windows refusals remain mandatory until implementation, independent
  review, and acceptance evidence all succeed.

## Considered options

- Keep the current handle and ACL composition: rejected because mutation lacks
  `WRITE_DAC`, descriptor recovery lacks write and delete authority, and protected state
  remains unobservable.
- Add `WRITE_DAC` to every retained file: rejected because it violates least privilege,
  leaves recovery incorrectly typed, and does not expose the protected control bit.
- Use path-based mutation with copied identity checks: rejected for private files because
  it weakens exact-handle authority and still cannot prove protection.
- Delegate to a subprocess: rejected because it adds pathname, parsing, availability,
  resource-bound, and authority-transfer problems.
- Fork or replace `windows-acl`: rejected for now because its mutation and enumeration
  behavior is adequate once rights and protected-state observation are supplied.
- Expose a generic Win32 security-descriptor wrapper: rejected because it expands D9
  beyond fixed product policy.
- Add purpose-specific handles and one bounded protected-state observation to the D9
  crate: chosen because it repairs the proven gaps while keeping policy and unsafe scope
  narrow.

## Constraints

The accepted product-provisioning D9 boundary is stable. Its confinement of unsafe calls
to the private operating-system module, exact `windows-sys` pin, warning-denied build,
safety arguments, and independent review remain binding. This decision extends its
permitted primitive list but relaxes none of those restrictions.

The accepted provisioning-authority D5-D7 boundary is stable. Secrets still arrive only
after hardening; pending credentials remain tied to the installation guard; bootstrap
remains descriptor-led and recoverable; exact cleanup remains handle-based. The accepted
generation-authority distinction between retained capability and copied observation is
also stable. A copied identity or ACL list cannot replace a retained handle. (Addendum
2026-07-21: one explicit, bounded narrowing exists for the Windows credentials
DIRECTORY; see the dated addendum in the Acceptance section. Files are not affected.)

The extension exposes fixed-purpose safe operations only. It cannot expose raw pointers,
generic ACL construction, arbitrary security-information flags, unbounded descriptor
bytes, borrowed raw handles, caller-selected principals, or product authorization policy.
Read-only authority cannot compile against rewrite, mutation, or deletion, and creation
or recovery authority cannot be obtained by converting a read-only value.

Unknown entry types, unexpected flags, duplicate principals, inherited or additional
entries, null DACLs, oversized lists, and indeterminate descriptor control fail closed.
The dependency version remains pinned and its relevant behavior is re-audited before any
upgrade.

No product or distribution Windows gate is removed merely because the new API compiles.
Removal requires warning-denied builds, independent source review of each new unsafe call
and safety argument, and real NTFS evidence on every supported Windows target.

## Implementation

**D1: Split private-file authority by purpose.** The Windows authority crate provides
distinct safe values for empty-file creation, mutable bootstrap recovery, read-only
verification, and directory hardening. Each requests only its required read, write,
security-control, DACL-write, or exact-deletion rights. (Amended 2026-07-21: one
additional value, read-only DIRECTORY observation, completes the purpose split for
tree-wide verification of objects the verifier may not own. It carries only
`READ_CONTROL`, attribute-read, and synchronize rights with permissive sharing — no
`WRITE_DAC`, no delete, no child operations, no handle borrow — refuses non-directory
and reparse targets at open, and exposes only its identity, revalidation, and the D3
snapshot. It exists so read-only verification never opens the mutation-capable,
exclusive hardening authority. No new unsafe primitive: it reuses the existing open
and D3 snapshot paths.)

**D2: Keep safe mutation in the audited dependency.** Product and distribution code use
the pinned `windows-acl` handle API to remove unexpected entries and install the fixed
three-principal policy. File mutation uses the exact retained handle. Directory mutation
remains bound by its retained handle, delete-sharing exclusion, and full identity check.

**D3 (superseded in place 2026-07-21): Observe DACL control and entries in one snapshot
inside D9.** The private operating-system module adds one bounded observation over an
owned retained file or directory handle: a single `GetSecurityInfo` call requesting DACL
security information returns one allocated self-relative descriptor, and the primitive
reads BOTH the descriptor control word (protected state) and the DACL entry list from
that same allocation before freeing it inside the call. The primitive returns a bounded,
normalized, owned snapshot — the protected flag plus, per entry, the entry type,
inheritance/audit flags, access mask, and textual principal identifier — and exposes no
raw handle, pointer, raw descriptor bytes, mutable descriptor state, caller-selected
security-information flag, or product policy. Absent, NULL, empty, unknown-type,
malformed, or oversized (beyond a fixed entry cap) DACLs fail closed as typed errors
inside the primitive. The safe shared validation layer consumes this one snapshot for
every D4 fact — current-user, LocalSystem, and built-in Administrators principals,
exact masks and flags, duplicate detection — so protected state and entry facts can
never be assembled from two descriptor states. Validation over a snapshot is explicitly
point-in-time and is repeated around authoritative operations per D5.

*Supersession note.* The original D3 returned only a protected-state boolean and
directed the safe layer to join it with separate `windows-acl` entry enumeration. That
composition was implemented and rejected: the control word and the entry list came from
two independently fetched security descriptors, so the joined "protected exact list"
claim could straddle two different descriptor states between the fetches — a
time-of-check race no consumer-side care could close. Microsoft documents that
`GetSecurityInfo` returns the requested information in one allocated descriptor, which
removes the race by construction. Only this observation primitive changes: D1's
purpose-split rights, D2's `windows-acl` 0.3.0 mutation layer, D4's complete validation
fact list, D5-D7, the fixed principal set, consumer gates, and typed refusals all remain
binding as written.

**D4: Define one complete private-authority validation.** Validation requires
`SE_DACL_PROTECTED`, no inherited entry, exactly one explicit allow entry for each fixed
principal, exact masks and inheritance flags, unchanged full-width identity, regular
non-reparse type, and one link for files. A matching list without the protected bit is
invalid.

**D5: Use complete authority for creation and recovery.** Files are created empty,
hardened, and revalidated before bytes arrive. Bytes are written, synchronized,
same-handle reread, and followed by another authority validation. Recovery reopens a
descriptor with the mutable recovery authority and retains rewrite and exact-retirement
capability through settlement.

**D6: Retire gates only after proof.** Current typed refusals remain while the authority
surface is implemented and reviewed. Product and distribution gates retire independently
only after their production paths use the new types and pass required NTFS evidence. No
weaker fallback exists.

**D7: Require real NTFS acceptance.** Tests start with an extra inheritable principal,
prove initial inheritance, harden an empty retained child, and prove unchanged identity,
protected state, inherited-entry absence, and the exact list. They repeat validation
after write, synchronization, close, and reopen; exercise descriptor recovery and exact
retirement; prove read-only values cannot mutate; and cover directory inheritance using
production APIs without mocks, patches, skips, or expected failures.

## Acceptance

Accepted 2026-07-20 as written. The research's factual claims were verified against the
code at acceptance: `AuthorityFile::create_prepared` omits `WRITE_DAC`, the read-only
reader constructor is used on recovery paths that later require rewrite and exact
retirement, and `windows-acl` 0.3.0 sets `SE_DACL_PROTECTED` during mutation while
exposing no way to observe it.

Amendment accepted 2026-07-21 with explicit user approval: D3 is superseded in place by
the single-snapshot observation above. Driving evidence: the first implementation of the
shared private-policy validation was rejected in review because protected state and
entry checks were read from two separately fetched, raceable security descriptors; the
prototype was removed while consumer gates stayed intact. The amendment is narrow — no
other decision, constraint, gate, or the `windows-acl` mutation role changes.

Addendum recorded 2026-07-21 (review-driven, credentials-directory observation): the
Windows credentials DIRECTORY is an explicit, bounded narrowing of the retained-handle
constraint. `RetainedCredentialDirectory` holds a copied path plus full-width filesystem
identity — no live directory handle — and re-observes the directory per operation
through the read-only directory observation authority, revalidating identity and the D3
DACL snapshot and failing closed on any mismatch. Credential FILES are unaffected: each
remains created, hardened, revalidated, written, and retired on its own exact retained
handle. Reason for the narrowing: a long-lived retained directory authority denies
write sharing, so it cannot coexist with the hardening authority's `WRITE_DAC` open —
holding the directory handle would block the directory's own hardening and
re-validation. Why it stays sound under this decision's threat model: the model is
cooperative same-user (see the provisioning-authority constraints); an
intermediate-path substitution between observations is detectable only after the fact,
but it cannot forge file-level protection because every credential file's protected
three-principal state is proven on that file's own retained handle, and the next
directory observation fails closed on identity or DACL mismatch. This narrowing grants
no traversal: the observation authority opens the directory object only and never opens
children through it. If this boundary ever needs strengthening, the vehicle is the
tracked Windows parent-directory durability follow-on (plan step W01.P01.S177), not an
inline widening.

Addendum recorded 2026-07-21 (architect ruling, distribution-datastore directory
bridge): the distribution-authority datastore objects held through `cap-std` receive
their Windows owner-private protection through PARENT-RELATIVE retained authority, and
never through a reconstructed pathname. Driving fact: a `cap-std` directory handle is
opened with `GENERIC_READ` and permissive read/write sharing, so it lacks exactly one
right that matters here: `WRITE_DAC`. It is not otherwise rights-poor — `GENERIC_READ`
maps through `STANDARD_RIGHTS_READ` to `READ_CONTROL`, so a capability handle CAN observe
its own DACL; what it cannot do is write one, which is why hardening THROUGH the held
handle is impossible. (Corrected 2026-07-21 from a broader claim of rights-poverty. The
correction came from real-NTFS evidence, not review: an acceptance test asserting the
parent could not read its own DACL FAILED, and was rewritten to pin the actual boundary by
driving both operations through the capability handle — the DACL read succeeds, the DACL
write is denied, and the child hardens regardless. Nothing downstream changes.) That impossibility was
read too broadly. The requested access of a relative kernel open applies to the CHILD
object being opened, not to the parent handle supplied as its root; and every datastore
object requiring protection is a NAMED SINGLE-COMPONENT CHILD of a directory this crate
already retains. A child may therefore be opened with `WRITE_DAC` through a parent that
lacks it, hardened, and proven — retained capability, not copied observation. This extends D1's purpose split with parent-relative constructors for
directory hardening and for read-only directory observation, and adds no new native
primitive: the two relative-open unsafe calls already reviewed under the
`a2a-archive-materialization` D4 boundary are parameterized by rights mask, their
no-reparse, exact-disposition, and delete-share-denial behavior unchanged. The
alternative bridge — opening the hardening authority on a reconstructed absolute path,
with or without comparing the resulting identity against the one observed through the
`cap-std` handle — is REFUSED. Identity comparison detects a substituted object after it
has been opened and hardened; it does not prevent one, and it cannot speak for
intermediate path components, which Windows resolves through reparse points regardless of
no-reparse behavior at the final link. The credentials-directory narrowing above is not a
precedent for it: that narrowing is sound only because every credential FILE carries an
independent protected proof on its own retained handle, whereas a datastore directory
protects its contents BY INHERITANCE and so has no independent fallback proof. Under the
accepted generation-authority distinction, copied observation is admissible only where
retained capability is unavailable; here it is available, so it governs. The same
discipline binds the datastore FILES: each is created or reopened relative to its
retained parent with the rights its own hardening requires, hardened on that exact
handle, and validated unchanged by D4; no validator for inherited-only, unprotected child
descriptors is authorized, here or anywhere (the class boundary that decides which files
this binds is stated in the private-file class addendum below). The parent-relative FILE
half of D1's purpose split is exactly TWO constructors — exclusive create-new hardening
authority, and read-only verification authority — each differing from its path-named
sibling in one respect only: how the object is named. No parent-relative RECOVERY or
retirement variant is authorized: recovery authority exists for the credential bootstrap
descriptor's reopen-rewrite-retire lifecycle, the datastore has no such lifecycle, and
public surface on this reviewed unsafe boundary is not added for symmetry with a lifecycle
that does not exist. Because these constructors are selected BY rights mask, the crate's
access-right and file-flag constants must first be single-sourced: a mask value may be
declared exactly once in this crate and never hand-typed beside an import of the same name
from the system bindings, since a safety argument that rests on a right being ABSENT from
a mask is only as sound as the guarantee that both spellings of that mask denote the same
value. Two boundaries
this grants nothing on. It grants no traversal and no general pathname-to-handle bridge:
a relative constructor opens exactly one named direct child and nothing beneath it. It
does not advance gate retirement — the datastore lane carries a further Windows refusal
for directory-metadata durability, which belongs to the tracked parent-durability
follow-on (plan step `W01.P01.S177`) and must not be resolved inline; the outer
`production_platform_gate` retires only after that refusal is settled and real-NTFS
evidence exists, since retiring it earlier converts an honest up-front refusal into a
mid-operation failure over already-mutated state. Consistent with D7 and the
artifact-level proof rule, a `cfg(test)`-only Windows success arm standing in for a
production refusal is not acceptance evidence and must be removed rather than relied on.
What legitimately replaces such an arm is platform-scoping the success-path tests to the
platform that can execute them PLUS one test asserting the other platform's real
behaviour — the typed refusal, reached over genuine inputs, leaving no committed state.
That is the opposite defect class, not a restatement of it: the deleted arm ASSERTED a
success the production code cannot deliver, whereas scoping withdraws a coverage claim and
replaces silence with a positive assertion of what actually happens. It is admissible only
as TRACKED debt: every scoped test cites the follow-on that will discharge it, the scope
comes off when that follow-on lands, and a test that cannot then be un-scoped is a finding
rather than maintenance. Recorded consequence of applying this: because the distribution
datastore's directory-durability step refuses on Windows from inside the mutation
sequence, the tracked parent-directory durability follow-on (plan step `W01.P01.S177`) is
a PREREQUISITE of the datastore lane's integrated Windows evidence, not a follow-on to it;
the dependency reads the other way around from how it was planned. Constructor-level NTFS
evidence remains achievable meanwhile, since the parent-relative constructors are provable
without driving the lane. For the integrated Windows leg to become possible that follow-on
must leave no typed durability refusal in the non-test build, reach the object through a
handle already retained rather than any reconstructed path, stay bounded and fail closed,
and carry a REVIEWED durability argument about the trust store rather than an asserted
one. (Amended 2026-07-21 on real-NTFS evidence: the premise that Windows cannot flush
directory metadata is FALSE, and the typed refusal rested on an unexamined assumption
rather than a platform limit. `FlushFileBuffers` requires `FILE_WRITE_DATA` or
`FILE_APPEND_DATA`; on a DIRECTORY `FILE_ADD_SUBDIRECTORY` IS `FILE_APPEND_DATA`, which
this crate's own directory rights already carry — only the capability handles the
datastore passes lack it. The sanctioned closure is a bounded reopen of an already-retained
handle TO ITSELF: a relative open with an EMPTY name, flush-only rights, and identity
proven on the reopened handle. It resolves no pathname and belongs to the relative-open
family already reviewed, so it is a new primitive requiring the full D9 unsafe review, not
a new exception requiring a decision. Widening the long-lived capability handles' rights
instead is REFUSED: a retained directory handle that denies write sharing is what collided
with hardening twice already, and flush-capable rights must not accrue to the hardening
value, which deliberately excludes them. The durability argument accordingly no longer
asks why no flush is needed but what the flush ESTABLISHES — what `FlushFileBuffers` on a
directory handle commits, what NTFS metadata journaling contributes, and the bound the
claim cannot exceed on a volume whose write cache does not honour a flush. Ordering is
fixed: contents become durable before the name that publishes them — a file before its
containing directory, and a directory's contents before any rename that makes it visible.)

Addendum recorded 2026-07-21 (architect ruling, private-file class boundary and
single-sourced policy constants). First, the boundary between per-file hardening and
directory-inherited protection. A Windows file whose private state must be PROVABLE
INDEPENDENTLY OF ITS PARENT AT A LATER TIME is hardened on its own exact retained handle
under D5 and validated under D4 — no exception. That is every authority-bearing file:
credentials, bootstrap descriptors, and the distribution TRUST-DATASTORE metadata, whose
`root.json` is the anchor a later verification run reads to decide a trust outcome. The
reason is not stylistic: an inherited descriptor is not `SE_DACL_PROTECTED` and carries
`INHERITED_ACE` entries, so a later reader could only credit it by ALSO re-observing the
parent — joining two objects' descriptor states observed at two different times, exactly
the race the amended D3 exists to eliminate. Directory-INHERITED protection is sufficient,
and is the faithful Windows analog of the Unix arm's `0600`-inside-`0700` contract, only
for files meeting every one of four conditions: they are transient scratch created and
destroyed inside ONE operation; they live inside a directory whose protected exact DACL
was proven at creation and remains continuously held for the file's whole lifetime; they
carry no secret and no trust anchor; and they are never revalidated as independent
authority. The publication-staging tree qualifies on all four — its contents are TUF
metadata and target archives destined to be PUBLISHED, its signing keys are read from
caller paths outside staging and never written into it, and the private directory there is
defense-in-depth against tampering during the operation rather than a confidentiality
boundary. It is also the forced answer: those files are written by the pinned `tough`
library through paths of its own choosing, so no per-file handle exists to harden without
forking that dependency, whereas inheritance protects them correctly with no interposition
at all. The bright line a reviewer applies: wanting to VALIDATE a file's private state is
itself proof that the file belongs to the hardened class, because the inherited class has
no validator and may never acquire one. Second, the duplicated Windows hardening
composition. D2 is UNCHANGED: `windows-acl` mutation stays in the product and distribution
consumers and does not move into the authority crate, whose value is a small independently
reviewed unsafe boundary that a security-descriptor-mutating dependency would enlarge for
every consumer. Two composition copies are accepted; the datastore half adds no third,
because it extends the same distribution-side module. What may NOT be duplicated is the
fixed policy itself: the three principal identifiers, the exact access mask, and the file
and directory ACE flag values are single-sourced as public constants of the authority
crate's `private_policy` module, and no consumer may declare its own literal for any of
them. That makes drift impossible rather than merely discouraged — a consumer that
installs anything other than what the shared validator requires fails its own validation
immediately, in production and in the NTFS acceptance evidence. A reviewer verifies
lock-step by two checks: no principal, mask, or flag literal is declared outside
`private_policy`, and every hardening path terminates in a shared `validate_private_*`
call. The pinned `windows-acl` 0.3.0 API's `winapi` pointer type is a bounded consequence
of that pin, not a second native-authority surface; it carries no unsafe code into either
consumer and retires with any future replacement of that dependency.

Boundary note recorded at acceptance: this decision governs the private-file
DACL/protected-state authority (credentials, bootstrap descriptors, distribution rollback
state, and the protected-state verification arm). The retained-parent-relative child
regular-file creation primitive required by the archive materializer is authorized by D4
of the `a2a-archive-materialization` decision. Both live in the same isolated D9 crate
under the same warning-denied, safety-argued, independently reviewed discipline, and each
is separately reviewable.

## Rationale

The research established two independent failures: retained handles do not carry rights
required by the safe mutation library, and the library cannot observe the control bit
needed to prove that protection persisted. Adding rights alone produces an unverifiable
claim; replacing the library duplicates substantially more native ACL work.

Purpose-specific handles plus one bounded protected-state observation close both gaps
with the smallest D9 expansion. The design preserves useful safe dependency behavior,
prevents read authority from silently becoming mutation authority, and keeps native
pointer handling inside the already isolated and independently reviewed crate.

Keeping typed gates until real NTFS proof follows the existing fail-closed architecture:
Windows private authority is unavailable until demonstrated, not inferred from source
inspection or a passing non-Windows test.

## Consequences

- Windows credential bootstrap, descriptor recovery, exact cleanup, and distribution
  private state gain one reusable authority boundary.
- Product and distribution crates remain unsafe-free.
- The D9 unsafe exception grows by a bounded security-descriptor-control observation.
- Retained file handling becomes more explicit because creation, recovery, and reading
  use different types.
- Existing callers that assume every retained credential can rewrite or retire migrate.
- Equivalent-looking unprotected DACLs and access-mask supersets begin failing closed.
- `windows-acl` remains a critical pinned dependency whose behavior is re-audited on
  upgrade.
- Windows implementation stays blocked until independent unsafe review and real NTFS
  acceptance complete.
- Product and distribution typed gates remain visible evidence of that block and cannot
  be removed opportunistically.
