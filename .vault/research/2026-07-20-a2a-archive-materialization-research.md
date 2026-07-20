---
tags:
  - '#research'
  - '#a2a-archive-materialization'
date: '2026-07-20'
modified: '2026-07-20'
related:
  - "[[2026-07-20-a2a-distribution-trust-adr]]"
  - "[[2026-07-20-a2a-generation-authority-adr]]"
  - "[[2026-07-20-a2a-provisioning-authority-adr]]"
---

# `a2a-archive-materialization` research: `capability-bound verified archive materialization`

## Problem and scope

The distribution authority authenticates and retains one selected target archive. The
generation authority creates an empty exact unpublished-generation root and later proves
the complete semantic tree. The sealed provisioning facade consumes both authorities,
but it assumes the generation has already been populated.

No accepted decision defines the mutation bridge between those boundaries. The current
helper remains a fixed refusal, the distribution tests authenticate arbitrary text as
archive bytes, and `UnpublishedGeneration` exposes no retained-root population API. An
installer cannot therefore claim that a verified archive became a complete product
generation through product-authorized writes.

This research defines the decision surface for outer archive format, preflight parsing,
retained-root writes, durability, interruption recovery, resource bounds, and helper
composition. It does not alter TUF signing, complete generation verification, receipt
selection, nested capsule behavior, or channel ownership.

## Grounded findings

### Existing authority chain

- `VerifiedDistributionRelease` retains the TUF-selected archive and exposes only a
  read-and-seek projection after same-handle length and digest revalidation.
- `LockedProduct::create_unpublished` creates and retains an empty final generation name
  under the installation guard.
- `VerifiedReleaseSet::verify` proves a populated generation against distribution-derived
  member, cohort, component-lock, target, capsule, and installed-tree facts.
- S176 can seal an existing-install update once both values already exist. It neither
  extracts the archive nor authorizes another component to write the generation.
- The one-shot helper cannot transfer the opaque distribution capability across a process
  boundary and correctly reports only `REFUSED` while the same-process product operation
  is absent.

### Existing artifact formats are not a product decision

The current Cargo Dist plan emits `.tar.xz` for both macOS targets and both Linux targets,
and `.zip` for Windows. Those are legacy CLI artifacts, not the composite five-target TUF
archives. The accepted product decision names a complete Windows ZIP for Scoop, but no
decision chooses the outer format for all five TUF targets. The extensionless TUF target
names intentionally do not supply a caller-selectable format.

Using the legacy split would add two parsers, XZ decompression, tar link and extension
semantics, and target-specific recovery behavior. A single deterministic ZIP profile
keeps the byte grammar and materializer identical across the five targets while allowing
MSI to remain a separate channel wrapper.

### Extraction helpers are not authority boundaries

Archive libraries are useful bounded readers, but their convenience extraction methods
own pathname joins, directory creation, overwrite behavior, and cleanup. Upstream tar
documentation describes containment as best effort under concurrent destination
mutation, and historical advisories demonstrate that archive path policy is a security
boundary. The product must therefore own every destination mutation through a retained
generation capability. A library may decode one admitted regular-file stream; it may not
choose a destination or call `unpack`, `extract`, or an equivalent helper.

## Required archive grammar

- One canonical deterministic ZIP profile applies to every target. The target enum, not
  a caller flag or content sniff, selects the closed grammar.
- Entry names are rootless portable ASCII slash paths. Reuse the product limits of 4096
  bytes per path, 32 segments, and 128 bytes per segment. Reject empty segments, `.`,
  `..`, roots, prefixes, backslashes, colons or alternate data streams, controls,
  trailing dot or space, and Windows reserved names.
- Reject exact duplicates, ASCII-casefold duplicates, and file/directory-prefix
  collisions. Archive order has no authority.
- Admit regular files only. Derive all directories from accepted file paths. Reject
  symlinks, hard links, reparse points, junctions, devices, FIFOs, sockets, sparse or
  continuation records, ownership, access-control lists, extended attributes, alternate
  streams, and archive timestamps.
- Admit only Store and Deflate methods. Reject encryption, unsupported flags or methods,
  central/local name or size disagreement, overlapping data ranges, duplicate records,
  and comments. ZIP64 remains refused unless a later review proves its exact bounded
  subset necessary.
- Apply an executable-mode allowlist of `0644` and `0755`. Never materialize set-user-ID,
  set-group-ID, sticky, archive owner, or archive access-control metadata.
- Keep the two-GiB outer archive, eight-GiB expanded tree, 100,000-file,
  100,000-derived-directory, and depth-32 limits. Add aggregate header/path bytes,
  per-file size, decompression ratio, allocation, read, and wall-clock limits. Count
  actual decoded bytes rather than trusting headers.

## Recommended authority design

### Sealed materializer

`vaultspec-product` owns one sealed operation that uniquely borrows the verified
distribution release, locked product, unpublished generation, install provenance, and
durable transaction descriptor. No CLI, script, package adapter, or archive field supplies
a destination path, expected digest, generation name, or format.

The fixed lock order is installation guard, distribution verification and rollback-state
lock, archive plan and materialization, complete generation verification, then receipt
publication. Failure after TUF verification never lowers accepted metadata versions or
latest-known time.

### Preflight and manifest equality

The first pass parses the entire central directory and local headers within bounds,
normalizes every admitted path, rejects collisions and unsupported features, and builds a
closed plan. It locates exactly one member manifest by the TUF/cohort-authenticated member
manifest digest. The archive inventory must equal the trusted manifest inventory,
including the manifest's defined self-treatment. Header order and archive-supplied mode do
not add entries or authority.

The nested A2A capsule ZIP is one opaque regular product file in the outer generation. The
outer materializer does not recursively extract it.

### Retained generation writer

A crate-private `GenerationWriter` is borrowed from the exact unpublished generation. It
exposes typed operations over validated path segments and never exposes a pathname or raw
operating-system handle to the archive parser.

On Unix, it uses retained-parent-relative no-follow directory traversal, exclusive regular
file creation, and same-handle writes. On Windows, it requires a separately reviewed
retained-parent-relative regular-file primitive in the isolated Windows authority crate;
joined-path `OpenOptions` is not an acceptable substitute.

Each file is written to a transaction-reserved sibling name excluded from archive grammar.
The writer counts and hashes decoded output, synchronizes and same-handle revalidates it,
applies only the admitted release mode, then installs it without replacement relative to
the same retained parent and synchronizes that parent. Direct overwrite, link creation,
pathname cleanup, and Drop cleanup are forbidden.

After all entries, it synchronizes derived directories bottom-up, the generation root, and
the retained generations parent. Complete semantic verification still runs through the
existing generation verifier before receipt publication.

## Interruption and recovery

Before generation creation, the owner-private bootstrap or update descriptor binds the
authenticated release, cohort, target, archive and member-manifest identities, the
product-derived generation name, sealed channel provenance, intended receipt, and phase.
The descriptor and parent are synchronized first.

Minimum phases are preflighted, root-created, materializing, tree-synchronized, verified,
and receipt-settled. A generation remains inert until the fixed receipt selects it.

Recovery reacquires the same lock order, re-verifies distribution and descriptor facts,
opens the generation relative to the retained generations parent, and establishes new
exact authority. It may resume only a manifest-matching completed prefix and exact
transaction-reserved temporary objects. Unexpected, substituted, or mismatched objects
return retained recovery-required state. Cleanup consumes exact retained authority; when
that authority cannot be established, bounded residue is preserved rather than guessed
at by pathname.

## Considered options

- Use Cargo Dist's four tar-XZ plus one ZIP formats: rejected because those artifacts are
  incomplete legacy outputs and the split doubles parser, decompressor, policy, and test
  surface.
- Use one deterministic ZIP profile: recommended because one bounded reader and one
  authority writer can serve every target and the planned Scoop archive.
- Let archive libraries extract into a path: rejected because pathname choice, overwrite,
  link handling, cleanup, and concurrent destination behavior are product authority.
- Publish every installed file as an independent TUF target: rejected because target
  counts and metadata would scale with the product tree and duplicate the signed complete
  member manifest.
- Populate a temporary ordinary directory and later rename it: rejected unless the
  directory is the exact unpublished generation created and retained by product authority;
  a path-only temporary tree cannot become activation authority.

## Verification requirements

- Real archives cover every path, type, method, flag, collision, mode, count, depth,
  expansion, ratio, header, and manifest-inventory refusal.
- Real APFS, ext4, and NTFS interruption tests cut after descriptor sync, root creation,
  entry creation, decoded write, file sync, no-replace install, parent sync, final tree
  sync, complete verification, receipt publication, and descriptor retirement.
- Every restart proves prior-or-complete state and never a partial active generation.
- Tests use the production parser, retained writer, fixed journal, real filesystems, and
  real child processes without fakes, mocks, patches, skips, or expected failures.
- The same-process helper must verify, materialize, completely verify, and provision before
  it may emit bounded success. Independent security and code review remain mandatory.

## Conclusion

A new architectural decision is required. Distribution authentication and generation
verification are intentionally separate from mutation authority; neither implicitly
authorizes extraction. S174 may complete as byte authority, but helper success, first
install, S176 integration, and S11 remain gated until the archive materializer, Windows
child-file primitive, durable recovery protocol, and real interruption evidence are
accepted and implemented.
