---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S175'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
  - "[[2026-07-20-a2a-provisioning-authority-adr]]"
---

# Replace generic arbitrary-path credential access with ProductPaths-derived dashboard-only authority and a creation-free bounded foreign handoff reader, securely create retained ownership and attach-control files before secret bytes on Unix and Windows, remove Rust worker-IPC minting, and retain pending or existing ownership proof through durable bootstrap recovery

## Scope

- `engine/crates/vaultspec-product/src/credentials.rs`
- `engine/crates/vaultspec-product/src/credentials`
- `engine/crates/vaultspec-product/src/bootstrap.rs`
- `engine/crates/vaultspec-product/src/locking.rs`
- `engine/crates/vaultspec-product/src/lifecycle.rs`
- `engine/crates/vaultspec-product/tests/product_authority.rs`
- `engine/crates/vaultspec-product/tests/desktop_gateway.rs`
- `engine/crates/vaultspec-product/tests/lifecycle_ownership.rs`
- `engine/crates/vaultspec-cli/src/cmd/a2a_lifecycle.rs`
- `engine/crates/vaultspec-api/src/lib.rs`
- `engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs`
- `engine/crates/vaultspec-api/src/lib_tests/a2a_terminal_settlement.rs`
- `engine/crates/vaultspec-api/src/lib_tests/browser_and_contract.rs`

## Description

- Replace arbitrary-path `CredentialStore` construction with product-derived `DashboardCredentialStore` authority.
- Remove Rust worker-IPC roles and minting while retaining a creation-free, bounded foreign handoff reader.
- Create and retain Unix credential and descriptor files with no-follow opens, explicit pre-byte `fchmod(0600)`, exact owner and mode validation, single-link and identity checks, bounded reads, synchronized writes, and exact descriptor retirement.
- Publish a digest-only bootstrap descriptor before credential bytes and classify interrupted prepared states without path-based cleanup.
- Bind pending credentials and verified ownership proof to the retained installation guard and require proof bound to the controller's product paths for lifecycle mutation.
- Anchor Unix credential-directory traversal to the product root retained from the exact installation guard, and open the fixed `app-home/credentials` chain relative to that authority without following intermediate links.
- Keep unguarded Unix credential reads validation-only: wrong directory ownership or mode is refused without repair, while only guarded prepare/create authority may harden the directory.
- Migrate the CLI and API lifecycle seams to verified ownership proof and retained product-derived credential reads.
- Preserve absent, settled, recovery-required, busy, and unverifiable lifecycle observations explicitly; unknown authority never projects `installed: false` or `Uninstalled` readiness.
- Refuse mutating API requests under typed authority before job reservation, then reacquire, revalidate, and retain the same authority classes in the blocking effect frame.
- Refuse Windows bootstrap creation, recovery, and every dashboard or foreign credential read with typed `PlatformAuthorityUnavailable` before descriptor creation, secret creation, or token disclosure while the accepted protected-DACL authority cannot be established and proved safely.
- Classify `/internal/a2a/run-terminal` explicitly in the canonical route inventory as attach-control-authenticated, distinct from the machine-bearer route class, and prove that both a missing bearer and the machine bearer are rejected.
- Add real-file checks for exact token grammar, secret redaction, durable prepared-state classification, absence of Rust worker credentials, Unix owner modes, read-only refusal without mode repair, and the Windows pre-write authority gate.

## Outcome

DELIVERED.

The dashboard-only credential boundary and its Unix retained-authority substrate are present. One bootstrap or recovery transaction now derives the product root from the retained transaction-directory authority, proves that root against `ProductPaths`, and walks only the fixed root-relative `app-home/credentials` chain with no-follow directory handles. It retains one exact credentials-directory identity across descriptor access, both descriptor-relative credential creations, recovery reads, and pending authority. Existing ownership verification retains that directory and the exact ownership file, then revalidates the installation guard, root and child relationships, product-derived name, current file relationship, and same retained bytes immediately before lifecycle authorization. Real Unix tests reject both an intermediate `app-home` symlink and product-root replacement before credential-directory creation or permission mutation can escape the product root.

Unix readers no longer harden permissions as a side effect. Unguarded attach-control and ownership reads validate the existing credentials-directory owner and exact `0700` mode and refuse drift without calling `fchmod`; the real Unix drift test first proves both readers work in the conforming state, changes the directory to `0755`, and then proves both readers refuse while the mode remains `0755`. The current Windows host compiled this test through the Linux target; runtime Unix execution remains part of the broader real-Unix acceptance gate below.

Lifecycle, CLI, and API production paths no longer read `receipt.json` as installation or mutation authority. They observe only the fixed journal under an installation guard. Absent and settled states remain known; recovery-required, lock-busy, and unverifiable observations project `installed: null`, `installed_known: false`, null readiness, and explicit recovery/degraded state instead of fabricating an uninstall. Discovery cannot override non-settled release authority. An untrusted malformed journal remains unverifiable rather than being relabelled as a recoverable production transaction; production-created torn-journal recovery is proved in the fixed-journal suite and mapped explicitly by the lifecycle wire classifier.

The old public path-based remove and repair functions return typed refusal without mutation, and seated start or stale-recovery refuses until receipt-selected generation authority is available. CLI and API credential failures no longer use `.ok()`; platform-authority unavailability remains distinguishable from a missing or invalid ownership capability. Mutating API requests now perform typed pre-admission authority validation before registry reservation. The effect path reacquires and holds the installation guard and verified ownership in the same blocking frame as the currently available effect, and it no longer claims that an async timeout cancels a still-running filesystem mutation. An uninstalled mutation returns HTTP 409 `not_installed` before a job is created; recovery-required maps to its own wire kind, while genuinely untrusted bytes remain `unverifiable`.

The internal terminal-settlement callback remains outside the machine-bearer prefix set by design and continues to authenticate through its required `AttachControlAuth` extractor. It is now present in the canonical `CONTRACT_ROUTES` inventory and in an explicit `ATTACH_CONTROL_ROUTES` authentication class. The route-inventory guard therefore detects an unclassified router addition, the machine-bearer sweep covers only its declared class, and a direct route proof rejects both a tokenless request and the dashboard machine bearer. On Windows, each of the six settlement scenarios stops at the exact typed credential bootstrap gate before any credential, lease, callback, receipt, settlement, expiry, or restart-reconciliation effect; no credential is fabricated to bypass the accepted gate. (Superseded below: the D6 line later retired that Windows gate. This paragraph is preserved as the historical description of the pre-D6 state, not the current one.)

S175 is now delivered. The two reasons this record originally gave for staying open were both resolved by the D6 line (`44e96af13d`, `b8d0ae4886`, `57c87d3285`), which cross-platformed the bootstrap descriptor/recovery machinery and retired the Windows credential refusals recorded above: the Windows private-file-authority D9 substrate that this record notes as present but unmigrated is now consumed by product credential/bootstrap policy, and the bootstrap fact this record describes as a bool-shaped gate now derives from live proof instead. Verified against source and history at closeout: `DashboardCredentialStore::for_product` is the sole construction path for every scope consumer (CLI `a2a_lifecycle.rs:266,311`, API `a2a_lifecycle.rs:820,969,1065`, `lifecycle.rs:514,552`); `ForeignHandoffReader` is wired at API `a2a_lifecycle.rs:37,836`, backed on Unix by `openat(RDONLY|NOFOLLOW|CLOEXEC)` and on Windows by `ReadOnlyAuthorityFile::open_private_readonly` with a link-count check and a DACL proof taken before AND after the bounded read; both platforms harden before any secret byte (Windows `create_hardened_file` hardens the empty file's DACL before write-then-revalidate; Unix `create_in` creates at `0600`, writes, `fsync`s the file and its directory, then revalidates and rereads for comparison); Rust worker-IPC minting is removed outright (`cc19b87926` deleted `CredentialRole::WorkerIpc` and `create_worker_ipc`; the role enum now carries exactly two variants, with the absence asserted negatively in `product_authority.rs` and `desktop_gateway.rs`, and `lifecycle.rs:39` recording that the Python gateway owns that credential instead); and ownership proof is retained through durable bootstrap recovery via the single `claim_pending_credentials()` claim path (a second concurrent claim returns `BootstrapAuthorityInUse`), `RecoveryRequired` classified at five sites in `bootstrap.rs`, and `prepare_bootstrap`'s own doc comment recording that dropping its returned value preserves inert descriptor state for recovery. `cargo test -p vaultspec-product --lib --tests` passes clean at closeout.

## Notes

- Closeout note, 2026-07-22: the delivery recorded in the Outcome above landed across commits whose messages never name S175, chiefly `cc19b87926` (the module reorganization that removed `CredentialRole::WorkerIpc` and `create_worker_ipc`) plus the D6 line (`44e96af13d`, `b8d0ae4886`, `57c87d3285`). That is why the plan checkbox and this record both lagged the actual state for as long as they did; a future reader should not conclude the step was ticked without work.
- The process-local pending claim is tied to one exact live installation guard. A second simultaneous bootstrap attempt through that guard returns `BootstrapAuthorityInUse`; dropping the first authority permits exact durable recovery under the still-held guard.
- Unix ownership replacement is tested with real files: replacing the named ownership file, even with identical secret bytes and mode `0600`, invalidates the retained authority before lifecycle authorization.
- Unix root-containment tests use real directory moves and symlinks: an intermediate `app-home` symlink and a replacement product root are refused without creating or hardening credentials at the substituted target.
- The Windows gate retains its real-filesystem coverage: bootstrap refuses before creating the descriptor or either secret, and dashboard, ownership, and foreign-handoff readers refuse rather than disclose unprovable files.
- Unguarded Unix credential readers are validation-only. Only the guarded prepare/create path may harden the credentials directory; the mode-drift test is real filesystem behavior with no mock, patch, skip, or mirrored business logic.
- `restrict_to_owner` is crate-private and remains only a legacy compatibility helper for noncredential fixed-journal code. Credential creation never uses write-then-restrict.
- Prepared partial states remain inert and classified. `PreparedBoth` cannot yet resume, and settled-receipt descriptor recovery cannot yet retire safely, because the accepted D7 binding and interruption-safe descriptor format are absent.
- `cargo check -p vaultspec-api --tests` passed cleanly on `x86_64-pc-windows-msvc` after the retained-root and lifecycle-state changes.
- `cargo test -p vaultspec-api 'a2a_lifecycle::' -- --nocapture` passed 15 tests with zero failures and zero ignored. This covers real absent, busy, malformed-untrusted, pre-admission, legacy-receipt, and single-flight route behavior plus recovery-required wire mapping and discovery precedence.
- `cargo test -p vaultspec-product --lib` passed 95 tests with zero failures and zero ignored, including the production fixed-journal recovery evidence and the typed Windows control/credential gate.
- `cargo test -p vaultspec-product --no-fail-fast` passed the complete package suite: 131 tests, zero failures, and zero ignored across the library and four integration-test targets.
- `cargo test -q -p vaultspec-api --lib --no-fail-fast` passed the complete API library suite: 896 tests, zero failures, and zero ignored, including the Windows terminal-settlement authority gates and the attach-control route classification proof.
- `cargo test -q -p vaultspec-cli --no-fail-fast` passed the complete CLI package suite: 10 tests, zero failures, and zero ignored across three targets.
- `cargo check --target x86_64-unknown-linux-gnu -p vaultspec-product --tests` passed after the retained-root traversal change with zero warnings and zero errors.
- The final `cargo clippy -p vaultspec-product -p vaultspec-cli -p vaultspec-api --all-targets -- -D warnings` passed on the native Windows target with zero warnings and zero errors after all remediation changes.
- Scoped Rust formatting, Markdown validation, and `git diff --check` passed for the final remediation checkpoint.
- The first D9 private-file review rejected a shared-read creation handle because an inherited principal could retain a pre-hardening reader and observe later secret bytes. The revised creation and recovery handles deny all sharing, read-only authority exposes only bounded coherent reads, directory hardening requests no delete or child-creation rights, and the generic claim type can no longer stand in for creation or recovery.
- The revised Windows authority suite passed 28 real tests with zero failures or ignored tests. Its local-NTFS matrix covers an explicit inheritable extra principal, unprotected and protected observations, inherited-entry removal, exclusive create and recovery claims, synchronized write and reopen, bounded read, recovery rewrite, exact retirement, directory hardening, and identity preservation. Product policy, consumer migration, independent final review, and artifact-level supported-target NTFS evidence remain required before any typed refusal retires.
