---
tags:
  - '#audit'
  - '#windows-private-file-authority'
date: '2026-07-21'
modified: '2026-07-21'
related:
  - '[[2026-07-20-windows-private-file-authority-adr]]'
---

# `windows-private-file-authority` audit: `D9 single-snapshot private-file authority review`

## Scope

Independent D9 review of commits `75a4304f2b` (single-snapshot DACL rework) and
`ad9c05b034` (`ReadOnlyAuthorityDirectory`) against the amended ADR: the D3
single-snapshot supersession and the D1 read-only directory-observation
amendment, both dated 2026-07-21.

**VERDICT: APPROVED-WITH-ADVISORIES.** No blocking findings.

## Findings

### unsafe-review | low | all reviewed unsafe blocks confirmed correct

`GetSecurityDescriptorDacl`/`GetAce` borrow interior pointers into the single
`LocalAlloc` descriptor, are fully consumed before return, and the drop guard
frees exactly once on every path including unwind. The `SidStart` address-of
idiom and the `ConvertSidToStringSidW` `LocalWideString` single-free leak
nothing on any error path, and the ACE type gate is ordered strictly before
the `SidStart` read. `ACCESS_ALLOWED_ACE`/`ACCESS_DENIED_ACE` layout identity
was confirmed directly against the `windows-sys` 0.61.2 source, and
object-type ACEs are excluded before any post-header read is attempted.

### validation-invariants | low | supporting invariants hold

Revision is required to equal 1, `SE_DACL_PRESENT` is required, a
present-but-NULL DACL is a distinct typed error from an absent DACL, entry
iteration is capped at 16 entries before it begins, an unknown ACE type fails
closed, and no caller-selected flag reaches the primitive.

### contract-conformance | low | matches ADR verbatim, zero new unsafe

`open_observation`'s rights, sharing, flags, fail-closed checks, and surface
match the amended ADR verbatim. The change introduces zero new unsafe code;
`private_policy.rs`'s single-snapshot validation is unsafe-free. D6's refusal
gates remain intact — zero callers of `credentials::windows::create` exist.
Verification and generation kept their looser predicates unchanged, and zero
`ACL::from_file_path` call sites remain in the product crate.

### test-honesty | low | real NTFS throughout, scoping is honest

Tests exercise real NTFS end to end with no mocks or skips. The NULL-DACL
branch is covered by source review plus empty and oversized DACL cases rather
than a live NULL-DACL fixture — a deliberate, honestly-scoped choice under D7
and D8, ruled acceptable rather than a gap.

### independent-regressions | low | full suite reproduced clean

Reproduced independently: `vaultspec-windows-authority` 36/36,
`vaultspec-product` 217/217, `vaultspec-api` `a2a_terminal_settlement` 6/6,
and `just dev lint all` exit 0 (`cargo fmt --check`, `clippy -D warnings`,
the module-size gate, and the full frontend lint recipe).

### create-path-missing-write-dac | medium | dead/gated create() cannot harden at runtime

`credentials/windows.rs`'s `create()` opens via
`AuthorityFile::create_prepared` without `WRITE_DAC`, so `harden_handle`'s
`windows-acl` mutation would fail at runtime if this path were ever exercised.
It is currently dead, gated code (D6's refusal gates keep it uncalled), but
the future D6 un-gating slice MUST switch it to a `WRITE_DAC`-carrying open
(`PrivateFileCreation`) before it can be enabled.

### null-dacl-branch-scope | low | recorded so it is never re-litigated

`os.rs:575-581`'s NULL-DACL branch is source-review-only for a documented,
lint-enforced reason (see test-honesty above). Recording it here so a future
audit does not re-flag it as a missed test gap.

### process-note | low | stranded WIP absorbed, pre-existing module-size red cleared

Implementation absorbed a stranded pre-amendment WIP, preserved at a
scratchpad patch, and cleared a pre-existing module-size red at HEAD
(`lib.rs` at 1,526 lines, over the 1,500-line gate) via in-feature
decomposition.

## Recommendations

- Before un-gating D6's `create()` path, switch `credentials/windows.rs` to a
  `WRITE_DAC`-carrying open (`PrivateFileCreation`) so `harden_handle`'s
  `windows-acl` mutation succeeds at runtime instead of failing silently dead
  code coming alive.
- Leave the NULL-DACL branch's source-review-only test scope as-is; it is
  intentional and covered by this audit, not an open gap.
