---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S169'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Bind a non-clone retained LockedProduct authority to the verified installation guard, retain product generation-parent receipt-parent and unpublished-generation filesystem identities, reject the active generation, exclusively create its final owner-private no-follow name, derive the exact maximum-eight nonactive count through the active reader, and return removed or retained poisoned authority from identity-safe bounded discard

## Scope

- `engine/crates/vaultspec-product/src/generation.rs`

## Description

- Bind non-`Clone` `LockedProduct<'lock>` to one verified
  `InstallLockGuard`, retaining product-root, generation-parent, and
  receipt-parent (app-home) directory authorities.
- Read the fixed journal through S167's separately retained reader for each
  create, count, or discard observation: treat absence as no selection, accept
  only the settled active generation, and block recovery state.
- Enumerate direct generation children with bounded authority validation,
  require the settled active generation exactly once, and enforce the maximum
  of eight nonactive generations.
- Make `create_unpublished(&mut self)` retain the unique mutable product loan
  through its unpublished or diagnostic result.
- Use S168 retained relative directory authority on Windows and owner-private
  no-follow `rustix` operations on Unix.
- Return `Refused` only before creation or after proven cleanup, boxed
  `Retained(PoisonedGeneration)` only after exact child authority exists, and
  boxed `IndeterminateGenerationCreation` when Unix child authority cannot be
  established and parent-relative cleanup cannot prove removal.
- Consume unpublished authority during discard, reread the journal, revalidate
  the exact retained identity, and remove only its empty final name.
- Remove the obsolete direct `same-file` dependency from the product
  `Cargo.toml` and `Cargo.lock`.
- Add real filesystem regressions for active-aware bounds, collisions,
  permissions, substitution, retained cleanup failure, and Unix created-state
  cleanup uncertainty.

## Outcome

S169 now joins product paths, installation-lock authority, active-receipt state,
and retained filesystem identity into one non-cloneable authority chain. A
created directory never becomes active by presence. Creation and discard expose
no raw handle, serialized authority, recursive deletion, caller-selected active
generation, recovery conversion, or additional unsafe surface.

Windows retains S168 share-read-only directory leases, relative child access,
full-width identity, and consuming exact retained-directory cleanup. Unix uses
parent-relative no-follow `openat`, `mkdirat`, `statat`, and `unlinkat`; parents
must be current-owner and not group/other-writable, created directories must be
current-owner `0700`, and the opened descriptor snapshot must match the
post-`mkdirat` device, inode, directory type, owner, and permission bits.

Final independent re-review passed with C0/H0/M0/L0. The separate Unix
architecture audit also passed with C0/H0/M0/L0.

## Notes

The first formal review withheld acceptance at C0/H0/M1: retained post-create
validation or reopen failure could bypass cleanup, and the cleanup helper could
drop exact authority when cleanup failed. The repair constructed the token
immediately, routed failure through one consuming finalizer, separated
`Refused` from boxed `Retained`, and added real nonempty-retention and
empty-removal regressions.

The second formal review withheld acceptance at C0/H0/M1: Unix `mkdirat` could
succeed before `open_child` or `fstat` failed, bypassing the token and finalizer
and falsely returning `Refused` with final-name residue. The repair added a
custom created-state result, full no-follow snapshot comparison, lifetime-bound
boxed `Indeterminate`, and real Unix empty, nonempty, substituted-name, and
permission-drift regressions.

Unix pre-authority cleanup is parent-relative and full-snapshot checked under
the cooperative same-euid/install-lock model. POSIX provides no atomic
directory-create-and-open operation, so the `statat` to `unlinkat` sequence
retains a hostile-peer TOCTOU boundary and is not handle-exact. Missing or
unacceptable initial state, name loss, identity/type/owner/mode drift,
nonempty residue, or unlink failure remains `Indeterminate` while retaining the
product, parent authorities, and unique mutable loan.

Verification completed:

- `cargo check -p vaultspec-product`: passed.
- `cargo clippy -p vaultspec-product --lib -- -D warnings`: passed with no lint
  allowances.
- `cargo test -p vaultspec-product --lib generation::tests -- --nocapture`: 12
  native tests passed.
- `cargo test -p vaultspec-product --lib -- --nocapture`: all 79 native library
  tests passed.
- `cargo check --locked -p vaultspec-product --lib --tests --target
  x86_64-unknown-linux-gnu`: passed and compiled the four Unix-only regressions;
  it did not execute Linux tests.
- Strict Linux-target Clippy with `--lib --tests` and `-D warnings` reached only
  the pre-existing, out-of-scope `receipt.rs:685` `let _ = identity_handle`
  `let_unit_value` blocker and reported no `generation.rs` finding.
- `cargo fmt --all -- --check`, scoped `git diff --check`, dependency cleanup,
  and forbidden-shape checks passed.

Native Windows evidence covers owner-private ACLs and ACL drift, retained
rename/delete denial, collision and active-aware count bounds, receipt state,
identity-safe discard, and substituted-name refusal. Unrelated dirty-worktree
files remained outside this Step.

Implementation scope is exactly `engine/crates/vaultspec-product/src/generation.rs`,
`engine/crates/vaultspec-product/Cargo.toml`, and `engine/Cargo.lock`. Governance
closure is exactly this S169 Step Record, the product audit, the generated
product index, and the product plan.
