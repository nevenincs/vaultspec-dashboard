---
tags:
  - '#research'
  - '#windows-private-file-authority'
date: '2026-07-20'
modified: '2026-07-20'
related: []
---

# `windows-private-file-authority` research: `protected exact-handle authority for Windows private files`

This research evaluates whether `windows-acl` 0.3.0 and the existing retained Windows
handles can satisfy the accepted requirement that credentials, bootstrap state, and
distribution rollback state receive a protected exact-principal DACL before authority-
bearing bytes are written.

## Findings

The accepted provisioning decision requires the credentials directory and each empty
credential file to receive a protected DACL containing only the current user,
LocalSystem, and built-in Administrators. File mutation must use the exact retained
handle, and protection must be revalidated before secret bytes arrive. It explicitly
requires a D9 amendment if the safe dependencies cannot prove this contract.

`windows-acl` 0.3.0 does set protection while mutating a DACL. Its internal apply path
combines `DACL_SECURITY_INFORMATION` with `PROTECTED_DACL_SECURITY_INFORMATION`;
handle-backed lists call `SetSecurityInfo`, while path-backed lists call
`SetNamedSecurityInfoW`. Both entry addition and removal use this operation.

The dependency cannot observe whether the resulting security descriptor remains
protected. Its enumeration exposes access-control-entry type, SID, mask, and flags,
including `INHERITED_ACE`, but exposes neither `SECURITY_DESCRIPTOR_CONTROL` nor
`SE_DACL_PROTECTED`. An exact-list check can reject observed inherited entries but cannot
distinguish a protected DACL from an unprotected DACL that presently contains the same
explicit entries.

Current retained-handle access is also insufficient. `AuthorityFile::create_prepared`
requests generic read, generic write, and delete access but not `WRITE_DAC`.
`AuthorityFile::open_reader` requests only generic read. The dependency's own handle-
mutation tests explicitly request `WRITE_DAC`, so handle-backed mutation cannot reliably
succeed through either current constructor.

The generic retained credential type additionally overstates a reopened handle's
authority. Recovery opens a bootstrap descriptor through the read-only constructor but
later calls rewrite and exact retirement. That handle has neither data-write nor delete
access, so interrupted bootstrap recovery and settlement retirement fail independently
of DACL hardening.

Directory hardening currently retains a directory that denies delete sharing and checks
its full identity around a path-backed change. This materially binds the operation, but
still cannot prove the protected control bit. The distribution rollback datastore has
the same observation gap. Both production paths therefore require typed refusal on
Windows until the missing D9 authority lands.

## Evaluated options

- Keep the existing handles and safe ACL calls: rejected because mutation lacks
  `WRITE_DAC`, recovered descriptors lack write and delete authority, and protected state
  remains unobservable.
- Add `WRITE_DAC` to every file handle: rejected because it violates least privilege,
  does not repair the recovery type mismatch, and still cannot observe protection.
- Use path-based ACL mutation plus identity checks everywhere: rejected for private files
  because it weakens the accepted exact-handle boundary and still cannot prove protection.
- Use `icacls`, PowerShell, or subprocess parsing: rejected because those paths are not
  retained-object authority and introduce parsing and resource-bound surfaces.
- Fork or replace `windows-acl`: feasible but unnecessarily broad; its mutation and entry
  enumeration remain useful once supplied a correctly authorized handle.
- Minimally extend the isolated D9 crate: recommended because it preserves safe product
  and distribution code while adding only purpose-specific handle rights and bounded
  protected-state observation.

## Recommendation

Amend D9 with distinct creation, recovery, read-only, and directory-hardening authority
types. Creation and recovery need generic read and write, `READ_CONTROL`, `WRITE_DAC`,
and delete access. Read-only credential authority needs generic read and `READ_CONTROL`
only. Directory-hardening authority needs `READ_CONTROL` and `WRITE_DAC` in addition to
its existing retained traversal and identity rights. A read-only value must not compile
against rewrite or retirement.

Keep safe DACL mutation and bounded entry enumeration in `windows-acl`. Add a bounded safe
exact-handle observation in `vaultspec-windows-authority` that reports whether
`SE_DACL_PROTECTED` is set. Its private operating-system module may minimally use
`GetSecurityInfo` and `GetSecurityDescriptorControl`; product and distribution crates
remain unsafe-free.

Revalidation requires protected state, no inherited entry, exactly one explicit allow
entry for the current user, LocalSystem, and built-in Administrators, exact file or
directory inheritance flags, exact `FILE_ALL_ACCESS`, unchanged retained 128-bit
identity, and one link for regular files.

## Real NTFS proof

Acceptance must start with a real parent containing an extra inheritable principal,
prove the child initially inherits it, harden the empty retained object, and then prove
unchanged identity, protected state, no inherited entry, and the exact three-entry list.
The proof then writes, synchronizes, same-handle rereads, closes, reopens, and repeats
validation. It also recovers and rewrites a prepared bootstrap descriptor, retires that
exact handle, proves a read-only value cannot mutate or delete, and exercises the
directory equivalent. Tests use production APIs and real NTFS objects without mocks,
patches, skips, or expected failures.

## Refetchable sources

- `windows-acl@0.3.0`, checksum
  `177b1723986bcb4c606058e77f6e8614b51c7f9ad2face6f6fd63dd5c8b3cec3`.
- `windows-acl@0.3.0/src/utils.rs:385-445` for protection flags and handle or
  path mutation.
- `windows-acl@0.3.0/src/acl.rs:687-733,939-1069` for construction, enumeration,
  addition, and removal.
- `windows-acl@0.3.0/src/tests.rs:238-358,361-414` for explicit `WRITE_DAC`
  mutation tests.
- `engine/crates/vaultspec-windows-authority/src/lib.rs:908-919,951-955` for current
  prepared and reader access masks.
- `engine/crates/vaultspec-product/src/credentials/windows.rs:31-56,116-175,226-247`
  for current retained operations and incomplete validation.
- `engine/crates/vaultspec-product/src/bootstrap.rs:151-160,229-237,332-372` for
  typed gating and recovery.
- `engine/crates/vaultspec-distribution-authority/src/lib.rs:767-864` for the parallel
  distribution datastore boundary.
- Microsoft `SetSecurityInfo`, security-information access rights, and
  `SetSecurityDescriptorControl` documentation as retrieved on 2026-07-20 from
  `learn.microsoft.com`.
