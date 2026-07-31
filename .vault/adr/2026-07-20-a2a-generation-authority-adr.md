---
tags:
  - '#adr'
  - '#a2a-generation-authority'
date: '2026-07-20'
modified: '2026-07-31'
related:
  - "[[2026-07-18-a2a-product-provisioning-research]]"
  - '[[2026-07-18-a2a-product-provisioning-adr]]'
  - '[[2026-07-18-a2a-product-provisioning-reference]]'
---
# `a2a-generation-authority` adr: `exact generation-root authority with semantic immutable release topology` | (**status:** `accepted`)

## Problem Statement

A verified unpublished generation must remain the same authorized generation through
activation, while its immutable release tree may contain up to 100,000 files and
100,000 directories. Retaining every child object would exceed practical descriptor
limits and the project's resource-bound rules. Comparing copied child filesystem
identities across scans is also unsound because identities can be recycled and are
observations, not retained capabilities.

Empty non-root directories expose the gap most clearly: they contribute no trusted
file-byte preimage to the release inventory, yet treating their copied identities as
durable authority produces platform-dependent results. A related creation gap exists
when a generation name is created but exact retained child authority cannot
subsequently be established; copied metadata does not authorize deleting whatever
later occupies that name.

This decision defines the boundary between exact authority and semantic verification.
It clarifies and extends D9 and D10 of the accepted product-provisioning ADR without
superseding that ADR or changing its status.

## Considerations

- Exact retained authority applies to the unpublished-generation root, its
  product-derived parent relationship, and the installation transaction lock.
- Nested release contents are an immutable semantic inventory. Child identities bind
  same-handle reads, detect aliases, and stabilize one scan; they are not cross-scan
  capabilities.
- Every accumulator and retained authority set must have an explicit operational bound.
  A release-scale set of live child handles is not acceptable.
- The closed inventory admits regular files and their necessary parent directories
  only. Mutable state belongs in the separate application home.
- Verification must fail closed for root substitution and for path, type, owner, mode,
  access-control, regular-file link-count, size, or digest drift.
- Replacing a nested object with one having the same complete semantic observation is
  not drift solely because its inode or file identifier changed.
- Cleanup is an authorized mutation. A pathname plus copied identity cannot substitute
  for exact retained authority.
- D8's artifact-level proof rule remains binding: tests use production code and real
  filesystems without fakes, mocks, patches, skips, or expected failures.
- D9's isolated Windows authority boundary and D10's lifetime-bound verified-release
  construction are stable parents. This decision narrows their interpretation; it does
  not license a generic native filesystem surface.

## Considered options

- **Retain every child handle through activation - rejected.** It would preserve child
  object identity, but a valid release can require roughly 100,000 live handles. That
  conflicts with explicit resource bounds, common descriptor ceilings, and portable
  operation.
- **Compare copied child identities across scans - rejected.** Device/inode and
  volume/file identifiers can be reused, do not retain the observed object, and
  incorrectly reject semantically identical replacement while still providing no
  mutation authority.
- **Permit empty non-root directories as release content - rejected.** They have no
  trusted byte-bearing inventory preimage, introduce namespace-only state into the
  immutable capsule, and would require either unsound copied identity or unbounded
  retained authority.
- **Use exact retained root authority with a semantic closed file inventory - chosen.**
  The root remains capability-bound, files remain byte-bound, directories are derived
  from accepted file paths, and bounded rescans can prove unchanged release meaning
  without retaining every child.

## Constraints

- The unpublished-generation root must remain lifetime-bound to the retained
  installation lock and must continue to prove its exact named relationship before
  verification, activation, discard, or receipt construction.
- Every non-root directory must be an ancestor of at least one accepted regular file. A
  directory subtree with no regular-file descendant is invalid.
- Scans remain bounded by the existing file-count, directory-count, depth,
  expanded-byte, path, and read limits.
- Traversal follows no links or reparse points, accepts no unsupported object type,
  rejects semantic path collisions and aliases, and checks owner-private access rules.
- Within one scan, each opened file is checked before and after hashing through the same
  handle. Child identities remain available only for this scan-local binding and
  diagnostics.
- Cross-scan equality ignores child identity alone. Equality still requires the same
  normalized path set, object types, authority-relevant ownership and access controls,
  declared modes, regular-file single-link state, sizes, and digests.
- Root identity is not semantic. Any root substitution, renamed-name mismatch, or loss
  of the retained parent relationship fails closed even when all nested bytes match.
- No new unbounded handle collection, retry loop, residue store, or generic unsafe
  operating-system API is authorized.
- If creation succeeds but exact retained child authority cannot be established, the
  operation must return an indeterminate result. Any residue remains subject to the
  normal bounded generation inventory and cannot become active authority.
- Recorded 2026-07-22: a retained distribution scope and a bound product authority MUST
  be able to hold the same product root at the same time. The overlap IS the guarantee —
  it is what makes "the release verified against this root is being installed into this
  root" one retained capability rather than two copied observations joined across a gap
  in which the root could be substituted. Any design that releases one before taking the
  other — staging and then dropping the verification scope, or binding before retaining —
  reintroduces exactly that window and is refused, however tidy the resulting lifecycle
  reads. Coexistence was proven rather than assumed: the product-root open had been
  requesting a `DELETE` right it never exercises, and Windows sharing refused a second
  opener on account of it; narrowing that one right to the rights actually used restores
  coexistence in BOTH orders and loosens nothing, because both handles still deny delete
  sharing to everyone else. Generalizing past this instance: when two retained
  authorities appear mutually exclusive, suspect an over-broad rights request before
  reshaping the lifecycle that needs them both.
- Corollary recorded 2026-07-22, because the two halves sound contradictory until
  separated: what coexists is the verified VALUE and the bound product, never the
  verification WORK and the bound product. Writing the trust datastore is itself a
  mutation of the product root, so it is SERIALIZED against a bound product authority
  rather than concurrent with it — and the lease's denial of write sharing is what
  enforces that exclusion, the same denial that carries the anti-substitution guarantee.
  The production order is therefore verify, hold the resulting value, bind, activate; a
  verification that writes while a product is bound fails closed, which is the lease
  working rather than a defect. This is load-bearing rather than descriptive: NO
  production flow may require a datastore write while a product is bound. If one is ever
  found to — a rollback or repair path re-verifying under a held lease, say — that is a
  design question to raise, never a sharing mode to loosen.
- Recorded 2026-07-22 (Unix enforcement of the corollary): the serialization above is
  enforced on Unix, not merely intended. LockedProduct::bind holds a nonblocking
  exclusive flock on its retained product-root directory descriptor for the product's
  lifetime; verification takes a nonblocking shared flock on the same directory for the
  duration of its datastore-writing work only, released before the verified value is
  constructed. A verification refused by the bound product's lock fails closed as
  datastore-unavailable. The lock is advisory by design: it serializes the engine's own
  flows and claims nothing against uncooperative writers — anti-substitution on Unix
  remains inode-identity detection at every trust boundary. The verified VALUE still
  coexists with the bound product in both orders; only the verification WORK is excluded,
  mirroring the Windows lease exactly.
- Recorded 2026-07-31 (how a Unix advisory lock is RELEASED): both guards release by
  explicitly unlocking their description, never by merely closing their descriptor. An
  `flock` lives on the open file DESCRIPTION, and every `Command::spawn` duplicates the
  process's whole descriptor table into the forked child, with `O_CLOEXEC` taking effect
  only at `exec`. So any unrelated spawn — the gateway, the updater, a migration child —
  briefly holds a second reference to whichever lock descriptions are live at that
  instant. A close-only release therefore dropped one reference while the lock stayed
  asserted through the child's, extending the exclusion past its intended end by the
  fork-to-exec window: measured at 1.8-35ms under load, and observed as the verification
  lock outliving the verified value's construction so the `bind` that production performs
  next was refused `RootAuthorityBusy`. Unlocking narrows release to exactly the intended
  instant and loosens NO exclusion — each guard owns a private description, holds its lock
  in full for its whole lifetime, and can never release another guard's. Generalizing:
  on Unix a lock's lifetime is the description's, not the descriptor's, so any advisory
  lock in a process that spawns children must be released by an explicit unlock.

## Implementation

Verification borrows the exact `UnpublishedGeneration` authority under the retained
installation lock. Before and after bounded traversal, it proves that the retained root
is still the product-derived generation named by the transaction.

Traversal constructs a closed semantic snapshot. It records accepted regular files by
normalized relative path, type, owner or authority policy, release mode, single-link
state, size, and digest. The directory set is derived from those file paths; each
derived directory is validated for safe type, owner, mode, and access control. A
non-root directory not represented as a parent of an accepted file causes verification
to refuse the generation.

A child filesystem identity is used only during its scan to bind a same-handle read,
reject hard-link aliases, detect concurrent substitution, and improve diagnostics. It
is omitted from cross-scan semantic equality. Consequently, same-path replacement with
identical bytes, mode, ownership, access controls, type, link count, and size is equal,
while any semantic drift fails closed.

The final bounded reread compares the complete semantic snapshot while separately
revalidating exact root authority. Only that combined proof may construct the
lifetime-bound verified release consumed by active receipt publication.

Generation cleanup consumes exact retained child authority. When a child name was
created but no retained authority was established, copied metadata or a later pathname
observation authorizes no deletion. The operation returns bounded indeterminate residue,
preserves any occupant, and requires later reconciliation under newly established exact
authority.

## Rationale

The immutable product contract is fundamentally byte- and manifest-derived, while
mutation authority is capability-derived. Keeping those concepts separate avoids both
an unbounded handle requirement and the false assurance of copied filesystem identities.

Exact root retention preserves D10's activation guarantee: the verified release remains
within the same authorized unpublished generation. Semantic nested verification
preserves the complete release guarantee at bounded cost. Refusing namespace-only empty
directories closes the only topology state that cannot be derived from trusted file
content. Refusing cleanup without a retained child capability applies the same authority
rule to failure recovery.

## Consequences

- Verification and activation retain a constant number of long-lived authorities rather
  than one per release object.
- Cross-platform behavior becomes consistent for inode or file-identifier reuse.
- A semantically identical nested replacement is accepted; child object continuity is
  intentionally not promised.
- Root substitution and every meaningful release-content or authority-policy change
  still fail closed.
- Capsules that currently contain empty directory placeholders must remove them or
  represent required state outside the immutable generation.
- Failed post-create authority establishment can leave one bounded, inactive residue
  instead of risking deletion of a substituted object.
- Documentation and tests that claim cross-time identity for every nested directory must
  be corrected to distinguish exact root authority from scan-local child identity.
