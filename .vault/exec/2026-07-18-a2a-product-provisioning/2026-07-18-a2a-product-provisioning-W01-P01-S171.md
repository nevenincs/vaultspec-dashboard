---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S171'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Extend the D9 Windows authority boundary with the sole safe same-directory first-journal installation operation backed by MoveFileExW replace-existing and write-through flags, rejecting cross-directory reparse and non-regular operands, with real certified local-NTFS tests and independent unsafe review

## Scope

- `engine/crates/vaultspec-windows-authority`

## Description

- Add the sole private `MoveFileExW` wrapper with exactly
  `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH`, bounded NUL-terminated
  UTF-16 operands, and immediate native error capture.
- Accept only an absolute path that resolves to the retained directory and two
  distinct bounded direct-child components. Canonicalize and rejoin operands
  before the native call so standard and verbatim path semantics cannot
  diverge.
- Open the source existing-only, synchronize it under a read/write handle that
  denies write and delete sharing, and require stable full-width identity,
  size, one link, regular-file type, non-reparse state, and non-delete-pending
  state.
- Hand the source to an overlapping read-only move-compatible authority before
  closing the synchronizer. Apply the same strict inspection and checked
  transition to an existing destination.
- Consume the exclusive parent authority only after opening and validating an
  overlapping zero-access, share-all transition authority. Recover the exact
  exclusive parent immediately after the native call.
- Revalidate retained handles, operand names, the retained parent, and both
  caller and canonical parent names immediately before the native call and
  again after successful replacement.
- Close an existing destination handle only at the unavoidable final native
  boundary. Preserve its validated snapshot and, on native failure, reacquire
  it by name only when the complete snapshot matches.
- Return typed `BeforeMove`, `MoveReturnedFailure`, and
  `MoveReturnedSuccessUnverified` outcomes with the exact recoverable parent,
  source, destination, snapshot, native-error, and reacquisition evidence.
- On success, return both the recovered exclusive parent and an overlapping
  strict read-only installed-file authority that denies write and delete
  sharing for S172's exact reread.

## Outcome

S171 provides the only safe Windows first-journal installation primitive
authorized by ADR D9. It performs a synchronized same-directory replace through
the exact native operation, preserves continuous source and parent identity
through the Windows-compatible authority transitions, and fails closed with
honest namespace evidence.

Real Windows behavior required two narrower authority transitions. A writable
source handle and the full exclusive parent cannot remain open across
`MoveFileExW`; an existing destination cannot remain open during replacement
at all. The implementation overlaps exact read-only transition authorities
before closing the strict source and parent handles, and records then
reacquires the old destination on native failure instead of making an
impossible handle-retention claim.

Final independent review passed with C0/H0/M0/L0 on frozen source hashes
`141C40FADFB6E82146FAE4D89A6CF228E3223EF2E22FB746188F56C9E69C39D3`
for `lib.rs` and
`5E5AB239E0DC1E9E717ADE46E82139FDE01EC94ABC4D997ABB3011297E79CF39`
for `os.rs`.

## Notes

The transition windows are deliberately explicit. A hostile same-user process
can acquire a compatible writer or mutate the namespace after the strict
handles are released. Repeated full-state and name checks detect observable
drift, but same-size hostile mutation cannot be excluded by this wrapper. S172
must exactly reread the installed journal through the returned strict authority
before publication.

`MOVEFILE_WRITE_THROUGH` and process-level tests do not certify power-loss
durability. S173 remains the mandatory real local-NTFS virtual-machine
power-cut certification step.

Verification completed on the confirmed NTFS `C:` test volume:

- `cargo fmt -p vaultspec-windows-authority --check`: passed.
- `cargo check -p vaultspec-windows-authority --all-targets --locked`: passed.
- `cargo clippy -p vaultspec-windows-authority --lib --tests --locked -- -D
  warnings`: passed without lint allowances.
- `cargo test -p vaultspec-windows-authority --locked`: all 21 native tests and
  doctests passed.
- Scoped `git diff --check` passed.
- The independent review repeated the native tests, strict all-target Clippy,
  formatting, diff checking, forbidden-technique scan, and unsafe-boundary
  inspection with no findings.

The shared branch advanced during execution. External consolidation commit
`78b860947f` swept the earlier S171 draft, including `os.rs`, into history before
review completed. External consolidation commit `10c271d639` then swept the
final consuming-parent, destination-snapshot, strict-installed-authority,
API-shape, test corrections, and audit append after review passed. Formal review
compared the complete frozen files against the pre-S171 authority baseline
`2331f89237`, so the verdict covers both provenance segments. No reset or
history rewrite was used.
