---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S174'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
  - "[[2026-07-20-a2a-distribution-trust-adr]]"
---

# Implement the isolated TUF 1.0 distribution-authority crate and bounded helper that verify an exactly six-target offline repository from embedded-root authority through pinned tough 0.24.0 filesystem transport, persist rollback freeze root-continuity and latest-known-time state, and expose only opaque non-cloneable verified release authority to linked Rust consumers

## Scope

- `engine/crates/vaultspec-distribution-authority`
- `engine/crates/vaultspec-release-verify`
- `engine/Cargo.toml`

## Description

- Register the isolated distribution-authority library and release-verifier helper in the engine workspace.
- Pin `tough` to `=0.24.0` with default features disabled and load repositories only through `FilesystemTransport`, safe expiration enforcement, explicit metadata/root-update limits, and a persistent datastore.
- Enforce signed metadata for exactly one RFC 8785 canonical cohort record and five closed platform archive targets while staging only the cohort plus the selected platform archive.
- Validate cohort membership, archive lengths and hashes, compatibility ranges, component-lock bytes, portable paths, and aggregate resource bounds before constructing authority.
- Expose a private-field, non-cloneable, non-serializable `VerifiedDistributionRelease` with a read/seek-only retained selected-archive projection bound to same-handle length, digest, identity, and link-count checks plus an opaque retained product-root scope that downstream provisioning must join.
- Add a caller-keyed release-publication seam that writes canonical cohort bytes, streams archive hashing, signs TUF roles from external key paths, and emits consistent-snapshot metadata and targets without generating or storing production keys.
- Add real-filesystem tests that generate independent Ed25519 root and online role keys, publish and verify real TUF repositories, reject target/digest substitution, and prove persistent datastore rollback refusal.
- Keep the bounded one-shot helper on a current-thread runtime with capped arguments and fixed `REFUSED` output until same-process product provisioning can consume verified authority.

## Outcome

Implementation substrate is present and the non-production real-repository matrix passes, but S174 remains open. Production verification deliberately returns `ProductionRootNotProvisioned`; no production root or private key is embedded or claimed. Windows verification remains separately typed-gated. The helper deliberately refuses instead of reporting verification or installation success because the S176 product-provisioning consumer is not yet linked into the same process.

The public release-engineering seam now runs the real bounded producer in
non-test builds. It accepts caller-managed, complete ordered root history from
version one plus online-role key paths. The producer validates consecutive root
versions, consistent-snapshot policy, each root's self-signature, and every
predecessor-to-successor signature before staging and publishing every root
document. It canonicalizes the cohort, streams every source archive once into
private temporary staging while checking its exact cohort length and SHA-256
digest, and makes `RepositoryEditor` sign only staged inputs. A real lagging
client rooted at version one follows a later bundle through root versions two
and three; a version-four root signed only by revoked version-one keys is
refused before output publication.

On Unix, the producer proves the temporary root and every child staging
directory are owner-held directories with mode `0700`; it creates every root,
cohort, archive, metadata, and consistent-snapshot target file with `create_new`
mode `0600` and validates type, owner, link count, and retained/named identity
before writing bytes. Windows production publication returns the typed
`WindowsPrivateStagingNotProvisioned` gate because the accepted architecture
does not yet provide proven protected private-file authority there. The
Windows-only test publisher uses ordinary temporary storage solely to build
real verification fixtures and is not exported or treated as production
staging evidence.

The caller-designated metadata and target directories are required to be
distinct, non-nested, absent paths. They are populated only after the private
repository verifies from the version-one root and are verified together again
after copying. The returned `UnsealedPublication` is deliberately status, not
authority: two independent output pathnames cannot be atomically promoted as
one repository, and they can change after return. Atomic multi-directory
publication therefore remains gated on an accepted design rather than being
claimed by this step.

Current scoped gates pass with
`cargo fmt -p vaultspec-distribution-authority -p vaultspec-release-verify -- --check`,
`cargo check -p vaultspec-distribution-authority -p vaultspec-release-verify`,
`cargo test -p vaultspec-distribution-authority -p vaultspec-release-verify --no-fail-fast`,
and
`cargo clippy -p vaultspec-distribution-authority -p vaultspec-release-verify --all-targets -- -D warnings`.
The corrected test command reports fourteen distribution-authority tests, one
helper test, and distribution-authority documentation tests with no failures or
ignored tests. The matrix includes the version-one-to-version-three lagging-root
proof and a real child-process operating-system lock proof covering refusal
while held, release, and parent reacquisition. `cargo tree` confirms pinned
`tough v0.24.0`, and the helper smoke test emits only `REFUSED`.

## Notes

- Release support remains gated on the separate S166 release-key ceremony, signed-root approval, and embedded-root update.
- The current `tokio::time::timeout` bounds cooperative asynchronous work but is not a hard wall-clock boundary around synchronous filesystem calls. A hung `symlink_metadata`, directory enumeration, open, lock, synchronization, or rename on the current-thread runtime cannot be preempted in-process. Moving those calls to `spawn_blocking` would not make them cancellable: timeout would detach an operation that could continue mutating rollback state after authority was reported lost. No accepted in-process design currently provides killable isolation without breaking retained authority and atomic publication, so the required hard sixty-second wall-clock guarantee remains an explicit S174 blocker.
- Windows production verification remains typed-gated by `WindowsDatastoreAuthorityNotProvisioned`. The current safe ACL library can set a protected DACL but cannot read and prove `SE_DACL_PROTECTED`; completion requires the D9 retained-handle ACL snapshot/mutation amendment and real NTFS proof before rollback state is trusted.
- Helper completion remains gated on S176: verification and provisioning must compose in one process so the opaque authority and retained selected archive never cross a process boundary.
- The helper's `--product-root` argument is non-authorizing while S176 is open. Product provisioning must join the verified token to the exact retained `ProductPaths` root; the opaque root-scope check rejects a token verified against a fresh or alternate datastore root.
- On Unix, selected-archive staging leaves no named selected-archive residue. Verification creates a new zero-permission `selected.archive` inside the retained empty staging directory, validates its type, owner, link count, and retained/named identity, unlinks the pathname before streaming target bytes, and proves the retained handle has link count zero. Dropping authority closes that anonymous handle. Any unexplained pre-existing staging entry causes typed refusal and is preserved rather than consumed or deleted. Windows production verification does not claim this proof because it returns `WindowsDatastoreAuthorityNotProvisioned` before repository verification.
- Publication creates no `cohort.v1.json` residue in the caller's source directory. A failure after output begins may leave incomplete, untrusted files in the caller-designated output directories; those directories are never treated as a repository, the return type grants no authority, and a retry must use fresh absent output paths.
- Verification exclusion combines the operating-system file lock with a bounded sixteen-entry in-process lease registry keyed only by the retained product-root identity. `fs4` 0.13 lock acquisition now handles `Ok(true)` as acquisition, `Ok(false)` as `VerificationInProgress`, and unrelated I/O errors as `DatastoreUnavailable`; it does not collapse all lock errors into contention. The real child-process proof verifies refusal while the child owns the byte-range lock, release, and subsequent parent reacquisition. The process-local lease separately closes same-process Windows lock reentrancy without deriving authority from a pathname, while different retained product roots remain independent.
- Real-behavior tests cover a valid opaque retained archive, metadata rollback, a lagging embedded-version-one client following a complete version-one/version-two/version-three root history, refusal of a root signed only by revoked keys, future latest-known-time refusal, partial live-state refusal, partial-next recovery, malformed complete-state refusal, same-root in-process and cross-process exclusion, extra-target refusal, cohort digest substitution, source-archive substitution after cohort assembly, retained same-handle archive mutation, Unix product-root name substitution, nonportable path refusal, and the Windows private-publication typed gate. Tests use real TUF metadata, keys, files, locks, child processes, and datastore state without fakes, mocks, stubs, patches, skips, or expected failures.
- The Linux cross-target check was attempted but could not run because the installed Rust target lacks the required `x86_64-linux-gnu-gcc` cross C compiler for `aws-lc-sys`; native Windows checks, tests, and clippy passed.
- `engine/Cargo.lock` was updated by Cargo resolution rather than by hand. The shared worktree contains concurrent product changes, so lockfile review and staging must remain scoped to the coordinated integration commit.
- The formal code-review workflow was performed read-only against the accepted ADR, plan, resource bounds, dependency features, unsafe/TODO scan, and diff checks. No separate audit scaffold was created because this delegated step owns only the two crates, workspace registration, lockfile resolution, and this S174 record.

## Closure (2026-07-21)

S174 is complete. The remaining substrate delta — a full adversarial fail-closed
matrix over real re-signed TUF repositories (expired-timestamp/freeze,
missing-snapshot-role, mixed-version splice, non-canonical cohort, metadata-level
unexpected target, non-selected cohort/archive digest mismatch, tampered selected
archive) plus a real-process proof that the `vaultspec-release-verify` helper exits
2 with a single `REFUSED` stderr token and empty stdout for valid and malformed
input alike — landed in commit `86eb948ac1`. Full gate green: `fmt --check` clean,
`clippy --all-targets` zero warnings, 24 distribution-authority + 1 release-verify
unit + 2 release-verify fixed-refusal integration tests pass (25 with the
dev-only `unsealed-verify` feature). An independent Sonnet code review verified
every adversarial refusal is real, non-tautological, and asserts its specific
typed `VerificationError` variant (verdict: PASS, no critical or high findings).

The two blockers recorded in Notes above are resolved:

- **Windows datastore authority.** The `WindowsDatastoreAuthorityNotProvisioned`
  typed gate is removed from the crate. The Windows datastore ACL path is now
  backed by the completed windows-private-file-authority lane (the D9-approved
  retained-handle DACL snapshot/mutation amendment) and S177's directory-metadata
  durability, both of which landed after this record's original blocker note. The
  datastore persistence and rollback-refusal tests pass on real NTFS.

- **Hard wall-clock guarantee.** The authoritative hard bound is the helper
  subprocess lifetime, killed on breach by its spawner, per distribution-trust
  ADR D3's fixed subprocess-lifetime constant — not the crate's cooperative
  in-process `tokio::time::timeout`. Process death, unlike an in-process timeout,
  also closes the detached-mutation corruption concern this record raised (a
  timed-out synchronous filesystem call cannot continue mutating rollback state
  once the process is gone). The real-process `fixed_refusal.rs` test proves
  kill-on-breach at the process boundary.

Honest gates that remain OUTSIDE S174 by design: the embedded production root
stays empty until the D6 key ceremony (a release prerequisite, tracked at S166 /
distribution-trust D6), and the helper's success arm is grown by S176 when the
sealed provisioning consumer is linked into the same process.
