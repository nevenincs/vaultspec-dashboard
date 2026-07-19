---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-20'
step_id: 'S168'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Extend the D9 Windows authority boundary with retained non-reparse directory handles, full-width directory identity, narrowly retained-handle child traversal, and exact retained-directory cleanup required by unpublished generation authority, with real Windows full-width identity reparse rejection substitution share-denial cleanup and error tests plus independent unsafe review

## Scope

- `engine/crates/vaultspec-windows-authority`

## Description

- Add the non-cloneable `AuthorityDirectory` safe surface with one pathname
  bootstrap, retained-handle relative open and exclusive create methods, copied
  full-width identity, and terminal exact-empty cleanup.
- Return failed cleanup as `RemoveEmptyDirectoryError`, which retains both the
  exact authority and operating-system error for inspection or retry.
- Validate every child name as one maximum-255-unit UTF-16 component before
  native access. Reject separators, prefixes, alternate data streams, control
  characters, reserved punctuation, trailing dots or spaces, and reserved DOS
  basenames.
- Use the retained parent as `OBJECT_ATTRIBUTES.RootDirectory` with fixed
  directory access, `FILE_SHARE_READ`, `FILE_OPEN` or `FILE_CREATE`, and the
  directory-only, synchronous, open-reparse-point options.
- Require the matching opened or created result from `IO_STATUS_BLOCK`, convert
  mapped native failures to Win32 errors, and preserve unmapped NTSTATUS values
  in diagnostics.
- Validate each returned handle for live directory type, directory attributes,
  zero reparse tag, non-delete-pending state, and nonzero 128-bit identity.
- Add real Windows tests for identity, Unicode and invalid names, collisions,
  missing children, parent-relative disambiguation, reparse rejection, retained
  write and delete leases, ancestor substitution, exact cleanup, retained
  nonempty failure, sentinel isolation, and native error conversion.

## Outcome

S168 now exposes only the directory primitive authorized by D9. No raw handle,
native structure, generic flag, arbitrary child path, recursive deletion, or
product policy crosses the safe boundary. `open_existing` is the sole pathname
bootstrap. Every child operation is relative to the retained parent, and every
successful result is already validated before safe code can observe it.

Verification completed:

- `cargo test -p vaultspec-windows-authority -- --nocapture`: 10 passed, with
  no ignored tests.
- `cargo clippy -p vaultspec-windows-authority --all-targets -- -D warnings`:
  passed.
- `cargo check -p vaultspec-windows-authority`: passed on Windows.
- `cargo check -p vaultspec-windows-authority --target
  x86_64-unknown-linux-gnu`: passed.
- `cargo fmt --all -- --check`: passed.
- Scoped diff and forbidden-test-technique checks passed.

## Notes

Architecture review initially withheld acceptance for incomplete Win32 component
grammar and lossy handling of an unmapped NTSTATUS. The revision rejects the
full approved reserved-name set and preserves the native hexadecimal status
when no Win32 mapping exists.

Independent follow-up review found the additional Win32 compatibility spellings
`COM¹`, `COM²`, `COM³`, `LPT¹`, `LPT²`, and `LPT³`. The final validator
rejects those basenames before extensions as well, using invariant ASCII case
folding and explicit UTF-16 code units. Real tests cover bare, mixed-case, and
extension-bearing spellings plus the allowed `COM⁴` lookalike.

A real probe showed that `FILE_WRITE_ATTRIBUTES` alone does not conflict with
share-read-only on this Windows host. The final lease test requests
`GENERIC_WRITE | FILE_WRITE_ATTRIBUTES`, the directory mutation authority
needed for reparse changes. That open fails while authority is retained and
succeeds after drop. Rename, deletion, and ancestor substitution follow the
same retained-lifetime boundary.

This Step does not integrate product generation code, receipt code, durable
replacement, or recursive cleanup. S169 remains responsible for binding this
primitive to product and installation-lock authority. S171 owns the separate
first-journal replacement primitive.
