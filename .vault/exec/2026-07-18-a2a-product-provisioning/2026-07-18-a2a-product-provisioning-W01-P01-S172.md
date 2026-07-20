---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S172'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---
# Construct an opaque active receipt only from a consuming unique-borrow lifetime-bound verified release set, retain exact authority on every non-success, and durably publish through the fixed tear-safe journal

## Scope

- `engine/crates/vaultspec-product/src/generation.rs`
- `engine/crates/vaultspec-product/src/manifest.rs`
- `engine/crates/vaultspec-product/src/receipt.rs`

## Description

- Strengthen `VerifiedReleaseSet` to retain the unique mutable
  `UnpublishedGeneration` borrow and copy the active generation text only from
  that exact token.
- Derive the product paths, installation guard, Unix app-home descriptor, and
  Windows synchronized-install authority only through sealed verified-set
  delegates; accept no caller path, guard, generation, sequence, or receipt
  payload.
- Construct the fixed active-receipt envelope only from
  `VerifiedReceiptFacts`, consume the verified set for publication, and return
  it inside a typed error on every non-success.
- Publish each proof replica by replacing only its older 256-byte subrecord,
  synchronizing, closing, reopening no-follow, comparing the exact complete
  journal image, and resolving the touched logical proof before advancing.
- Normalize all three replicas to the identical active transaction before the
  first target byte, positionally replace only the proved inactive 16-KiB
  slot, then normalize all three replicas to the identical retired proof.
- Recover every adjacent proof-creation, target-write, and proof-retirement
  cutpoint only when the supplied verified set reconstructs the exact intended
  envelope digest; reject divergent quorums, non-adjacent transitions, sequence
  overflow, mismatched verification context, and any third complete envelope.
- Preserve the prior slot as opaque recovery authority for an unchanged empty
  or partial-invalid target; never synthesize prior-only retired proof and
  never select partial target bytes.
- Create the Unix initialization residue mode 0600 relative to the retained
  app-home descriptor, install it with same-parent `renameat`, and synchronize
  that exact directory. Use the D9-authorized S171 transition on Windows and
  exact-reread the destination through its returned strict authority.
- Retain exact journal mutation authority, verified-generation authority, and
  Windows S171 transition evidence on failure. Bound repeated S171 diagnostic
  retention and expose a consuming retry path that first recovers the parent
  authority.
- Finish success only after the common guarded reader settles the intended
  wire and both the installation guard and complete release snapshot revalidate.
- Add real filesystem evidence for first install, sequence 1 to 2 to 3,
  initialization-residue reuse and refusal, every adjacent writer cutpoint,
  zero-mutation ambiguity, true post-write handle retention, and two genuine
  Windows S171 share-denial failures followed by successful retry.

## Outcome

S172 now implements ADR D10's bounded two-slot, three-replica durable
publication protocol behind the lifetime-bound S169/S170 authority chain and
the S171 Windows namespace boundary. A candidate cannot construct or detach an
active receipt. A failed or interrupted publication retains the exact
authorities needed for typed adjudication or retry, while ordinary selection
remains unavailable until the intended slot and every retired proof replica
exactly revalidate.

Independent final review passed with C0/H0/M0/L0 on frozen SHA-256 hashes
`0DBB519D4F6D547C910EE7C8A65A86DF851E458D72B8EDCF9CE5D4B6C5048178`
for `generation.rs`,
`482F6E14FFDA2E69A5B487DBCD69A4E0E6F3BC2CF23B57C8365AFC8E3F395354`
for `manifest.rs`, and
`1043DBED9BCB6BA96E6A672978D36F5B4F092F1B7E6D73EB217EA51854B85D24`
for `receipt.rs`.

## Notes

Restart recovery remains deliberately outside S172. W03.P06.S52,
W03.P06.S53, W03.P06.S56, and W03.P07.S59 must reopen the owner-restricted D6
transaction descriptor, reacquire the installation lock, rebind the exact
existing candidate generation, rerun complete release verification, reconstruct
the canonical next envelope, and require its digest to match the proof before
calling this publisher. S172 never scans generations or infers a candidate from
receipt bytes.

S173 remains the mandatory real local-NTFS virtual-machine power-cut gate.
Process termination, Windows share-denial tests, cross-compilation, and the real
Ubuntu run do not certify physical namespace durability.

The real Ubuntu run also reproduced a pre-existing S170/S163 limitation:
immediate remove and recreate of an empty directory can reuse both inode and
nanosecond timestamps. A proposed `ctime` check was rejected because it did not
detect the event. S163 must close this with bounded retained directory authority
or an equivalent non-reusable identity primitive and real filesystem evidence;
the limitation was not introduced by S172 and does not affect its journal
publication state machine.

Source history is split across consolidation commit `c6d15b778b`, which landed
the three-file S172 implementation, and hardening commit `e64290b1be`, which
made the Unix mode-0600 initialization path avoid a redundant pathname chmod
and prevented out-of-range Unix PIDs from wrapping into process-group probes.
No history rewrite was used.

Verification completed:

- `cargo test -p vaultspec-product --locked -- --nocapture`: 95 unit, 5 desktop
  gateway, 4 lifecycle ownership, and 23 product-authority tests passed on
  Windows; no test was ignored.
- `cargo clippy -p vaultspec-product --lib --tests --locked -- -D warnings`:
  passed without lint allowances.
- `cargo check -p vaultspec-product --target x86_64-unknown-linux-gnu --lib
  --tests --locked`: passed under the repository-pinned Rust 1.96 toolchain.
- A real Ubuntu 24.04 container executed all 96 library tests: every S172
  publication test and the signed-PID sweep regression passed; the run ended at
  95 passed and one carried S163 empty-directory identity failure that also
  reproduces unchanged at the pre-S172 `HEAD` baseline.
- Package-scoped formatting, scoped diff checking, forbidden-test-technique
  scanning, exact source fingerprinting, manual architecture review, and an
  independent formal review all passed.
