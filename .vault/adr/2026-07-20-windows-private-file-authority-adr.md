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
also stable. A copied identity or ACL list cannot replace a retained handle.

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
