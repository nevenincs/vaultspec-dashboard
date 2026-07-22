---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-22'
modified: '2026-07-22'
step_id: 'S177'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
  - "[[2026-07-20-windows-private-file-authority-adr]]"
  - "[[2026-07-21-windows-private-file-authority-ntfs-directory-durability-research]]"
---

# Deliver Windows directory-metadata durability for the trust datastore as a BLOCKING PREREQUISITE of the Stage-4 integrated proof and the Stage-5 datastore half. No typed durability refusal may remain in the non-test Windows build. Reach the object through an already-retained handle, never a reconstructed path. Bounded and fail-closed. Acceptance removes the 8 cfg(unix) scopes so those tests pass on real NTFS and deletes the interim refusal test. If NTFS journaling makes an explicit sync unnecessary, record that as a reviewed durability argument with crash and power-loss reasoning, never assume it silently.

## Scope

- `engine/crates/vaultspec-distribution-authority`
- `engine/crates/vaultspec-windows-authority`
- `engine/crates/vaultspec-product/src/credentials/windows.rs`

## Description

- Establish that Windows CAN flush directory metadata: `FlushFileBuffers` requires the handle to carry `FILE_APPEND_DATA`, and on a DIRECTORY object that bit IS `FILE_ADD_SUBDIRECTORY` (both `0x0004`), which the crate's own `DIRECTORY_ACCESS` mask already carries — the long-standing refusal was an unexamined assumption, never a platform limit.
- Implement `sync_directory_metadata`, which flushes DIRECTLY when the handle already carries the append right, and otherwise reopens the SAME object through that handle with an empty relative name and flush-only rights (`RootDirectory` set to the retained handle, identity re-proven, the reopened handle opened, flushed, and dropped inside the call).
- Ratify a contract deviation found by the test rather than assumed: the originally specified "always reopen" shape fails, because the crate's own directory handles are `FILE_SHARE_READ` only, so a second append-seeking open against them hits a sharing violation. Direct-flush-first is required for correctness, not chosen as an optimization; the reopen is entered ONLY on `ERROR_ACCESS_DENIED`, so a flush failure for any other reason propagates rather than being retried into a misleading success.
- Remove `production_platform_gate` and the `WindowsDatastoreAuthorityNotProvisioned` error variant outright, rather than leaving either inert, on the reasoning that a refusal no code can raise reads as a live guarantee to the next person.
- Remove all 8 `cfg(unix)`-scoped datastore tests that had carried the interim refusal's coverage debt, and prove them on real NTFS.
- Delete the interim Windows refusal test per its own embedded instruction, now that its premise is discharged.
- Author the dual-direction acceptance test (`directory_flush_requires_the_append_data_right`) asserting both that the flush is denied on a handle lacking the append right and succeeds on an otherwise-identical handle carrying it, plus the `FILE_ADD_SUBDIRECTORY == FILE_APPEND_DATA == 0x0004` bit-aliasing assertion against the `windows-sys` bindings directly.

## Outcome

Delivered across two commits: `ca509f1e63` (the `sync_directory_metadata` primitive and its dual-direction test) and `d8c5f6f01f` (gate and error-variant retirement). Real-NTFS acceptance (Windows 11 26200, NTFS 3.1): `vaultspec-distribution-authority` 17/17, `vaultspec-windows-authority` 42/42, both reproduced independently before the plan step was ticked. `vaultspec-updater`'s five remaining references to `WindowsDatastoreAuthorityNotProvisioned` (`lib.rs:544,576,701`, `tests/execute_drive.rs:28,274`) are prose inside doc/line comments describing the now-retired gate, confirmed to carry zero live code references; that crate still builds and its full test suite still passes. The durability conclusion this step's code depends on is recorded, with its bounds, in the windows-private-file-authority ADR and the NTFS directory-durability research document.

## Notes

`production_platform_gate` staying in place until this step, and the datastore lane's dependence on it, is documented at length in the windows-private-file-authority ADR's S177 criteria and durability-acceptance sections; nothing here restates that reasoning. The updater's stale prose references to the deleted gate/variant are a separate, already-flagged cleanup item outside this step's scope.
