---
tags:
  - '#adr'
  - '#a2a-archive-materialization'
date: '2026-07-20'
modified: '2026-07-20'
related:
  - "[[2026-07-20-a2a-archive-materialization-research]]"
  - "[[2026-07-20-a2a-distribution-trust-adr]]"
  - "[[2026-07-20-a2a-generation-authority-adr]]"
  - "[[2026-07-20-a2a-provisioning-authority-adr]]"
---

# `a2a-archive-materialization` adr: `capability-bound verified archive materialization` | (**status:** `accepted`)

## Problem Statement

The distribution authority authenticates and retains one selected archive. The
generation authority creates an empty exact unpublished-generation root and later proves
the complete semantic tree. The provisioning transaction consumes both only after the
generation has been populated.

No accepted decision defines who may parse the archive, choose its format, create
generation descendants, handle unsupported archive objects, synchronize the resulting
tree, or recover interrupted writes. The one-shot helper therefore cannot compose
verification with installation and correctly remains a fixed refusal.

This decision defines the missing mutation bridge. It refines distribution-trust D5, the
generation-authority decision, and provisioning-authority D1 and D7. It supersedes none
of them.

## Considerations

- Authenticated bytes do not themselves authorize filesystem mutation.
- Archive fields cannot supply a destination, generation name, expected digest, target,
  format, channel, or receipt fact.
- All five targets need one deterministic and independently testable archive contract.
- Archive pathname, link, collision, compression, mode, metadata, and expansion behavior
  are security boundaries.
- Generation writes must remain relative to exact retained product authority on Unix and
  Windows.
- A crash may occur at every file, directory, descriptor, verification, and receipt
  durability boundary.
- TUF rollback and latest-known-time state must not roll back when later local
  materialization fails.
- The helper cannot transfer opaque authority through JSON, stdout, a script, or another
  process.
- Real APFS, ext4, and NTFS behavior is the acceptance boundary.

## Considered options

- Preserve four tar-XZ targets and one ZIP target: rejected because those are incomplete
  legacy Cargo Dist artifacts and require two parser and decompressor policy surfaces.
- Use one deterministic ZIP profile for all five targets: chosen because one closed grammar
  and one authority writer can serve every product target and the planned Scoop archive.
- Let an archive crate extract into a destination path: rejected because extraction helpers
  own pathname joins, overwrite behavior, link handling, and cleanup rather than product
  authority.
- Publish each installed file as a TUF target: rejected because target metadata would grow
  with the product tree and duplicate the complete signed member manifest.
- Accept a caller-populated generation after verification: rejected as an install path
  because no sealed authority proves how those writes entered the exact generation.

## Decision

**D1: One canonical ZIP profile defines every composite target archive.** All five TUF
targets use one deterministic rootless ZIP grammar. The closed target enum selects the
profile; callers cannot select or sniff a format. MSI remains a channel wrapper, and Scoop
consumes the same complete Windows ZIP.

The admitted compression methods are Store and Deflate. Encryption, comments, unknown
flags or methods, central/local disagreement, overlapping records, duplicate records, and
ZIP64 are refused. Raw names are canonical portable ASCII slash paths. Exact and
ASCII-casefold duplicates plus file/directory-prefix collisions are refused.

Only regular files are admitted. Directories are derived from file paths. Links, reparse
points, devices, FIFOs, sockets, sparse records, ownership, access-control lists, extended
attributes, alternate streams, and archive timestamps are refused. Release modes are
limited to `0644` and `0755`.

**D2: Parsing produces a bounded plan, not filesystem effects.** A ZIP library may decode
bounded headers and one admitted regular-file stream. No production code calls its
extraction helper. Preflight reads the complete archive within fixed path, segment,
header, entry, depth, compressed-byte, expanded-byte, ratio, allocation, and wall-clock
bounds before creating generation content.

Preflight locates exactly one member manifest by the independently authenticated digest.
The normalized archive inventory must equal the trusted manifest inventory. Archive order
has no authority. The nested A2A capsule ZIP remains one opaque regular product file.

**D3: Product authority owns the materialization transaction.** One sealed product
operation uniquely borrows `VerifiedDistributionRelease`, the retained installation guard,
`LockedProduct`, exact `UnpublishedGeneration`, sealed provenance, and the durable
transaction descriptor. It accepts no caller destination, generation name, digest, format,
channel, or receipt facts.

The fixed lock order is installation guard, distribution-verification lock and rollback
state, archive plan and materialization, complete generation verification, then fixed
receipt publication. A later failure does not lower TUF metadata versions or
latest-known-time state.

**D4: A retained `GenerationWriter` is the only descendant mutation surface.** The
crate-private writer is borrowed from the exact unpublished generation and accepts only
validated path segments and admitted file metadata. It exposes neither a pathname nor a
raw operating-system handle to the archive parser.

Unix uses retained-parent-relative no-follow traversal and exclusive same-handle regular
file creation. Windows uses a narrow retained-parent-relative regular-file primitive in
the isolated Windows authority crate after separate unsafe review. Joined-path
`OpenOptions`, path canonicalization, and copied identity are not authority.

**D5: Each entry and the complete tree cross explicit durability boundaries.** Every file
is decoded into a transaction-reserved sibling name excluded from archive grammar. The
writer counts and hashes actual output, synchronizes and same-handle revalidates it,
applies the admitted mode, installs it without replacement relative to the same retained
parent, and synchronizes that parent.

After all entries, derived directories, the generation root, and retained generations
parent are synchronized in order. The existing complete semantic verifier then proves the
tree twice under exact root authority. Only that verified result may reach receipt
publication. No direct overwrite, link creation, pathname cleanup, or Drop cleanup is
authorized.

**D6: The durable descriptor makes interruption resumable.** Before generation creation,
the bootstrap or update descriptor binds the authenticated release, cohort, target,
archive and member-manifest identities, product-derived generation name, sealed
provenance, intended receipt, and phase. The descriptor and parent synchronize first.

The minimum phases are preflighted, root-created, materializing, tree-synchronized,
verified, and receipt-settled. Recovery reacquires the same lock order and newly establishes
exact authority relative to retained product parents. It resumes only a manifest-matching
completed prefix and exact transaction-reserved temporary objects. Unexpected or
substituted objects remain retained recovery-required state. Cleanup consumes exact
authority; otherwise bounded residue is preserved.

**D7: Helper success is one same-process authority chain.** The bounded helper loads the
embedded TUF root, verifies and retains the selected archive, materializes it through the
product writer, performs complete generation verification, publishes the fixed receipt,
retires the descriptor, and only then returns bounded status. No script, JSON record,
stdout payload, or second process transports verified authority.

Until the materializer, Windows child-file primitive, descriptor recovery, production
root, and sealed first-install provenance are implemented, the helper remains `REFUSED`.

**D8: Real artifacts and filesystems decide acceptance.** Tests use real deterministic
ZIPs and the production parser and writer. They cover every admitted and refused path,
type, collision, mode, compression, header, inventory, count, depth, expansion, and ratio
case. APFS, ext4, and NTFS tests interrupt and reopen every descriptor, root, entry, sync,
verification, receipt, and retirement boundary and prove prior-or-complete state with no
partial active generation.

Independent security and code review are required before the helper, first install, S176,
or S11 can be represented as complete.

## Rationale

A signed archive is a trustworthy byte stream, not a filesystem capability. Keeping
parsing separate from retained generation writes prevents a convenience extractor,
caller path, or archive entry from becoming mutation authority. One deterministic ZIP
profile reduces parser and platform divergence while retaining the target-specific TUF
and complete-manifest joins.

The descriptor and fixed lock order make interruption recovery part of the transaction
rather than an afterthought. Exact relative authority ensures that recovery either resumes
the intended objects or preserves ambiguous residue without deleting a substitute.

## Acceptance

Accepted 2026-07-20 after grounding review against the landed substrate (the retained
generation authority, the ordered update transaction and its `ReadyToActivate` seam, the
tear-safe fixed-receipt publisher, the double-scan release verifier, and the distribution
authority's retained-archive borrow). Two clarifications are recorded at acceptance;
neither changes a decision.

**Refinement A — the closed archive grammar admits at most 65,535 entries.** D1 refuses
ZIP64 while the bounds section reuses the 100,000-file product limits. A ZIP32
end-of-central-directory records its entry count in sixteen bits, so an archive with more
than 65,535 entries cannot be represented without ZIP64. The archive grammar's entry
bound is therefore 65,535; the 100,000-file and 100,000-directory limits remain the
generation-tree verifier's bounds over the installed tree, not archive-grammar bounds.
An archive whose declared or observed entry count exceeds 65,535 is refused as malformed.

**Refinement B — materialization owns its own transaction-reserved descriptor.** D6's
"bootstrap or update descriptor" is realized as a separate `materialize.v1` descriptor in
the product transaction directory, durably written and parent-synchronized before
generation creation, and scoped inside the update transaction's activation window (or the
bootstrap window on first install). It never mutates the update descriptor's phase
grammar mid-flight; recovery reads both, and the update descriptor remains the outer
authority. Retirement of `materialize.v1` follows receipt settlement.

The Windows child regular-file primitive named by D4 and the private-file DACL/protected-
state authority decided by the `windows-private-file-authority` decision are two distinct
primitives in the same isolated D9 crate; each carries its own safety argument and is
separately reviewable.

## Implications

- Composite release production must replace the legacy target archive split with the
  canonical ZIP profile.
- Product code gains a sealed materializer and retained generation writer; archive crates
  remain bounded readers only.
- The Windows authority boundary needs one additional purpose-specific child regular-file
  primitive and independent unsafe review.
- Installation costs a full preflight plus decoded write, synchronization, and complete
  semantic verification. The extra work is required before activation authority exists.
- TUF trust state may advance even when materialization fails; retry uses the same or newer
  authenticated release and never weakens rollback protection.
- S174 can remain byte authority, but helper success, first install, S176 integration, and
  S11 remain gated until this decision is approved and implemented.
