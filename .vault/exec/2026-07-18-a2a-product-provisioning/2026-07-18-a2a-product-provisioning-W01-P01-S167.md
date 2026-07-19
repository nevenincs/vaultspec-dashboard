---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S167'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Establish the fixed two-slot receipt journal and three non-selection logical proof replicas with two alternating subrecords each, synchronize and reopen before resolving the higher valid subrecord and two-of-three proof quorum, select the highest receipt sequence only after all logical replicas normalize to retired, reject proof ties overflow ambiguity aliases and unproved damage, validate active proof bound to the journal prior envelope target preimage next sequence and intended envelope, expose a bounded no-follow reader under the verified installation guard, and add no activation writer

## Scope

- `engine/crates/vaultspec-product/src/receipt.rs`
- `engine/crates/vaultspec-product/src/paths.rs` for the approved derived
  journal path and shared bounded generation grammar.
- `engine/crates/vaultspec-windows-authority/src/lib.rs` and `src/os.rs` for the
  narrow retained-handle hard-link-count observation approved by D9/D10.

## Description

- Add the derived `active-receipts.v1` path and bound generation identifiers to
  128 ASCII bytes before path interpolation.
- Define the exact 34,368-byte journal codec with two fixed receipt envelopes
  and three logical proof replicas of two alternating subrecords each.
- Parse a closed canonical `2.0` receipt payload into a privately constructed,
  non-cloneable `ActiveReceipt` carrying every D10 release-set fact.
- Authenticate every decision-bearing proof header and body byte, select only
  the higher valid alternating subrecord, invalidate equal-sequence divergence,
  and require byte-identical logical quorum.
- Select a receipt only under three identical retired logical proofs; classify
  every active or split-retired quorum as guard-bound recovery authority.
- Verify the installation guard before filesystem access, synchronize through a
  write-capable retained handle, close, reopen no-follow, revalidate exact size
  and full journal identity, and retain the reopened authority for the result
  lifetime.
- Enforce current-owner access, reject symlink or reparse final links, reject
  hard-link aliases and unsupported file shapes on both supported platforms,
  and retain the Windows share lease that denies writes and deletion through
  every hard-link name while the observation is live. Revalidate the retained
  handle's link count before exposing an already-resolved state.
- Keep all fixed-journal codecs in-memory and private, with no file publication,
  slot mutation, proof publication, activation, or recovery writer.
- Exercise the production codecs and reader with real files, real ACLs, real
  hard links, and the real `InstallLockGuard`; use no mock, fake, patch, skip, or
  expected-failure technique.

## Outcome

The S167 read foundation is implemented without integrating lifecycle or later
generation authority. The fixed reader never opens `receipt.json`; the legacy
API remains only as a temporary compilation seam. Empty slots never select.
Initial proof binds its one exact slot, transaction retirement binds the exact
prior and intended envelopes, and ordinary selection cannot escape unanimous
retired proof. Active proof, creation splits, retirement splits, torn
alternates, and non-unanimous retired genesis all return typed
`RecoveryRequired` without exposing a cloneable settled token.

Verification completed:

- `cargo test -p vaultspec-windows-authority -- --nocapture`: one real
  hard-link-count test passed.
- `cargo test -p vaultspec-product receipt::tests -- --nocapture`: 22 passed.
- `cargo test -p vaultspec-product --lib -- --nocapture`: all 68 library tests
  passed.
- `cargo check -p vaultspec-windows-authority`: passed.
- `cargo check -p vaultspec-windows-authority --target
  x86_64-unknown-linux-gnu`: passed.
- `cargo clippy -p vaultspec-windows-authority --all-targets -- -D warnings`:
  passed.
- `cargo check -p vaultspec-product`: passed.
- `cargo check -p vaultspec-product --target x86_64-unknown-linux-gnu`:
  passed.
- `cargo clippy -p vaultspec-product --lib --tests -- -D warnings -A
  clippy::needless-return`: passed; the single allowance isolates an unrelated
  existing warning in `generation.rs`.
- `cargo fmt --all -- --check`: passed.
- `git diff --check` for the S167 implementation and evidence files: passed.

## Notes

S167 uses an initial write-capable Windows handle only to synchronize the
journal before closing it. It then retains a no-follow read handle, opened with
a share mode that denies write and delete, together with its full 128-bit
`FILE_ID_INFO` identity. A narrow safe-wrapper extension observes
`FILE_STANDARD_INFO.NumberOfLinks` through that exact retained handle. Real
tests prove pre-existing aliases are rejected, aliases introduced during an
observation invalidate subsequent state access, and writes/deletion through
either name remain denied until the read result drops. S168 still must close
the app-home parent/directory-authority seam before later consumers become
selectable.

The independent safety and intent review originally found the Windows
pre-existing-alias gap at high severity. After the D9/D10 amendment and narrow
wrapper remediation, the re-review marked that finding resolved and retained
the original verdict and rationale in the audit history.

The complete package test progressed through 67 library tests and five desktop
gateway tests, then failed the unrelated unchanged
`mutating_control_requires_owned_attach_and_ownership` integration assertion.
The concurrent dirty `discovery.rs` removes
`restrict_handoff_to_current_user`, so the unchanged fixture receives
`NoTrustedHandoff` instead of `ForeignAttachable`. S167 changes neither that
module nor the integration test.

The S167 plan checkbox was closed only through
`vaultspec-core vault plan step check` after both independent reviews passed.
Unrelated dirty-worktree files remain outside this Step.
