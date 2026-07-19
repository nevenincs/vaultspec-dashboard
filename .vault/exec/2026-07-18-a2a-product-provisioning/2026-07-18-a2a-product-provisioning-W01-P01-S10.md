---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S10'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Bind every installation mutation to one retained transaction authority

## Scope

- `engine/crates/vaultspec-product/src/locking.rs`
- `engine/crates/vaultspec-product/Cargo.toml`
- `engine/Cargo.lock`
- `engine/crates/vaultspec-windows-authority/`
- `engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs`
- `engine/crates/vaultspec-api/src/lib_tests/a2a_runtime_identity.rs`

## Description

- Publish one bounded, versioned fixed owner claim with a 32-byte random nonce
  beside the operating-system lock. A retained guard binds the canonical
  product root, transaction directory, lock, claim identity, claim bytes,
  owner, process identifier, and process start time.
- Refuse the gateway before touching the lock. Only installer and copied-updater
  actors may acquire it, and only an owner-matching process instance positively
  proved dead or replaced may authorize stale-claim recovery.
- Treat missing, zero, inaccessible, or otherwise inconclusive process evidence
  as `Unverifiable` and therefore live/busy for mutation authorization.
- Retain an owner-verified `0700` Unix transaction-directory handle and perform
  every lock, claim, and prepared-file create, open, stat, link, and unlink
  relative to it through the safe, exact `rustix 1.1.4` filesystem API.
- On Windows retain full 128-bit `FILE_ID_INFO` identities, deny the required
  write/delete sharing for the guard lifetime, and delete only the exact held
  object. ADR D9 confines the six documented Win32 calls to the private
  `vaultspec-windows-authority::os` module while every consumer remains safe
  Rust.
- Provide explicit fallible guard release, use it on every production lifecycle
  exit, and keep bounded Drop diagnostics only as crash/fallback behavior.
  Stale-discovery removal must succeed or be already absent before a gateway may
  start under the held lock.

## Outcome

The installation authority now composes crash-released operating-system
exclusion with a fixed, identity-bound owner claim. Replacement, aliases,
malformed claims, foreign owners, live or unverifiable processes, weak Unix
directory permissions, parent-directory swaps, and Windows share violations
all fail closed. The seated lifecycle reports quarantine and release failures
honestly and never starts after a failed stale-discovery removal.

The first formal review withheld three high and two medium findings: an implicit
unsafe-lint escape, path-based Unix authority, binary process proof, swallowed
cleanup failures, and a no-op subprocess helper. ADR D9 and the first revision
closed the unsafe, cleanup, and test findings. Manual and independent re-review
then caught two remaining highs: `Some(0)` start times and non-descriptor-
relative Unix operations. The second revision closed both. Independent final
reviews passed the production core and API integration with no critical, high,
medium, or low finding.

Verification on the final snapshots included Windows and Linux target checks,
strict wrapper Clippy, strict Linux product Clippy, four locking unit tests,
fourteen named real lock/process integration tests, the lifecycle stale-
recovery success and real Windows share-denial tests, formatting, and diff
checks. The complete S11 test target
also passed 23/23 after its fixture was reconciled with S06, but that file and
the S11 system step remain open for S08/S162/S163 receipt and unpublished-
generation authority.

## Notes

- The Windows unsafe boundary is authorized only by accepted ADR D9 at commit
  `ee6385a113`; expanding it requires another accepted amendment and review.
- Unix exact cleanup excludes other users and protects cooperating same-user
  product processes. It does not claim to defeat a malicious same-UID rename
  between the final same-directory identity check and `unlinkat`.
- The installed Linux target compiled and passed strict Clippy. The Unix
  parent-replacement test compiled here but still requires execution on target-
  native Linux/macOS CI; local WSL has no Rust toolchain.
- Strict Windows product Clippy remains blocked only by the unrelated existing
  `generation.rs:243` `needless_return` finding.
