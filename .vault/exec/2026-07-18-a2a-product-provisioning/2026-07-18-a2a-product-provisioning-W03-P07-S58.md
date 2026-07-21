---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S58'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S58 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Expose a testable updater runner that consumes one owner-restricted descriptor and delegates all authority checks to vaultspec-product and ## Scope

- `engine/crates/vaultspec-updater/src/lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Expose a testable updater runner that consumes one owner-restricted descriptor and delegates all authority checks to vaultspec-product

## Scope

- `engine/crates/vaultspec-updater/src/lib.rs`

## Description

- Expose the testable updater runner in `lib.rs`: `run(descriptor_path)` consumes one owner-restricted descriptor and delegates every authority check to `vaultspec-product`.
- Define the one-time, secret-free `UpdaterDescriptor` (version, machine app home, installation-lock owner, optional prior-seat relaunch) with `deny_unknown_fields` + bounded validation; the fresh-update EXECUTE intent is deliberately omitted until the materializer's activation-seam contract defines it (not guessed).
- `read_descriptor`: verify owner-restricted via product's `handoff_is_owner_restricted`, bounded no-follow read, parse, validate.
- `run`: derive product paths from the descriptor app home, acquire the installation lock as `Actor::CopiedUpdater` (busy → typed `Busy`; the gateway can never acquire — enforced by the product `Actor` gate), retire the one-time descriptor so a replay finds nothing, then recover any interrupted transaction via product `recovery::recover`. Add secret-redacted bounded diagnostics (`redact`).
- Add serde/serde_json deps (now used by the descriptor) + tempfile dev-dep; add integration proofs over real files + the product authority: valid-descriptor lock+recover+retire, replay refusal, world-readable/malformed/wrong-version/relative-app-home refusal, and busy-lock reporting (without retiring the descriptor).

## Outcome

Delivered `src/lib.rs` (runner) + `tests/runner.rs` (5 proofs). `cargo test -p vaultspec-updater`, `clippy --all-targets -D warnings`, `fmt --check` all exit 0. Unsafe-free (workspace forbid).

## Notes

The fresh-update EXECUTE path (authenticated drain of the discovered gateway → snapshot → migrate → materialize → receipt-commit SWAP) is the activation seam owned by the materializer (Fable); the runner reaches it via the transaction/activation contract and never implements the swap here. The drain-of-discovered-gateway + `Quiescence`-handoff half is the specific contract dependency I need from Fable's `ReadyToActivate` work — the updater has no `GatewayProcess` handle and cannot mint `Quiescence` (pub(crate) to product), so I will code the execute call to the seam and NOT guess it. The full recover-an-interrupted-transaction integration (real durable descriptor + snapshot) lands in S62; S58 proves the NoTransaction recover path plus the descriptor/lock/replay/redaction contract.

TWO SEAM GAPS the fresh-update EXECUTE path depends on (both product-crate, both owned by the materializer lane, neither buildable in the updater): (1) an authenticated drain-BY-DISCOVERY + `Quiescence`-handoff product API — the updater has a DISCOVERED gateway (loopback control broker + discovery + pid-liveness), NOT an owned `GatewayProcess` handle, and cannot mint `Quiescence` (pub(crate)); (2) the materialize + `publish_active_receipt` swap (the archive materializer). The finalized drive contract the updater will CONSUME once those land: descriptor → `InstallLock`(CopiedUpdater) → `UpdateTransaction::begin` → `OwnedGatewayLease::acquire(paths, &guard, raw_discovery, now_ms, freshness_ms)` (OwnedLive-or-typed-refusal; a foreign gateway is never drained) → `UpdateTransaction::drain_and_stop_discovered(&mut self, lease, deadlines) -> (Quiescence, StopEvidence)` (attach-auth POST /drain closes admission + resolves runs, bounded-poll readiness, ownership-capability POST /shutdown, double-evidence exit = dead pid AND dead endpoint; on timeout `StopTimeout` → updater rolls back, NO force-kill of the non-child pid) → snapshot → migrate(Quiescence) → `ready_to_activate` → `release.materialization_source().await` (the single async touch, hosted in the updater executable's tokio runtime) → `vaultspec_product::materializer::activate_update(ready, &mut product, source) -> UpdateActivated` → relaunch/probe → Accepted; a pre-commit failure returns `ActivationFailure` retaining `ReadyToActivate` for the single rollback path. The updater RECEIVES `Quiescence` (never mints it) and never edits `transaction.rs`/materializer. tokio + distribution-authority deps join the updater when this path is wired.

A THIRD coupling governs the S60 dashboard cutover specifically: writing the one-time OWNER-RESTRICTED descriptor on WINDOWS is blocked by the same windows-private-file DACL authority the materializer lane is building. On Unix it is a trivial create-new + `0600`; on Windows the file inherits the parent ACL and there is no safe primitive yet to set the exact three-principal protected DACL (current user, LocalSystem, built-in Administrators) — the product's own credential creation already REFUSES on Windows for exactly this (`bootstrap.rs` windows_authority_unavailable). Shipping a handoff whose Windows descriptor write silently no-ops the owner-restriction would be a security hole (a one-time descriptor that is not actually owner-restricted), so S60/S61 are DEFERRED until BOTH (a) the windows-private-file DACL authority and (b) the drain/swap/relaunch seam land; the Unix-only descriptor half is deliberately NOT built alone — S60 lands whole, cross-platform. S62's provable-now proofs (real binary: gateway-never-locks, concurrent-holder→busy, descriptor-replay-fails, descriptor-error-echoes-no-content, real recover-of-an-interrupted-transaction from a durable descriptor + real SQLite snapshot) and S63's standalone Windows replace-only-after-exit timing proof are committed and green but left UNTICKED (partial, seam-noted) until the drain/swap/relaunch halves complete on Fable's contract.

## P07 completion checklist (do NOT tick S60-S63 until each is met)

The EXECUTE drive is wired (`execute_update`): begin → `OwnedGatewayLease::acquire` → `drain_and_stop_discovered` → snapshot → migrate → ready → clean rollback; `DiscoveryAbsent` → `ColdPathPendingMint` (no fake `Quiescence`); foreign/stale/incompatible → typed rollback. 4 platform-portable error-branch proofs are green. Remaining, each gated on a materializer-lane piece:

1. COLD MINT — when Fable lands `assert_cold_stopped` (re-reads discovery, requires ABSENT else typed refusal, advances Staged→Draining, mints `Quiescence` inside the txn): replace the `ColdPathPendingMint` stub arm with the real cold drive. Full cold-path safety precondition (documented in `execute_update`): the SEAT is stopped — satisfied by construction because the updater runs POST-seat-exit (S60 stops the seat, then launches the updater).
2. SWAP — when Fable lands `materialization_source().await` + `materializer::activate_update` (commit 3): replace the clean-rollback-at-ready with the real materialize + receipt-commit; add tokio (single-async) + distribution-authority deps to the updater then.
3. S60/S61 — when the windows-private-file DACL authority lands: build the cross-platform owner-restricted descriptor WRITE + the copy-out/handoff/seat-exit/relaunch cutover (axoupdater retired ONLY when the swap actually works) + the cli help/refusal alignment. The descriptor execute-intent CONTENT/schema may extend now; the WRITE waits on the DACL.
4. END-TO-END OwnedLive SUCCESS PROOF (REQUIRED before S62 ticks / P07 closes) — the interim coverage is component proofs (Fable's transaction-level `the_transaction_mints_quiescence_only_after_a_proven_discovered_stop` + S52/S55/S56). The terminal proof must be written when the path is BOTH (i) COMPLETE (activate_update/swap landed so there is a real end-to-end) AND (ii) AUTHOR-VERIFIABLE (the DACL authority makes the live drive Windows-runnable, OR a CI/unix verification the author can confirm green) — never an unverified `#[cfg(unix)]` test. Tracked as task #61.

## Landed since: cold branch + activate_and_accept

The cold-drive branch (`630c2d80f8`) and the injected-seam `activate_and_accept` (`79e220c3d4`) are DONE. `execute_update` converges both drain and cold paths on a never-faked `Quiescence` (cold via `assert_cold_stopped`) and returns the `ReadyToActivate` token. `activate_and_accept(ready, paths, guard, &mut source, ActivationParams, relaunch, relaunch_probe)` binds `LockedProduct`, calls `activate_update`, and — post-commit, NEVER rolling back — runs the INJECTED `relaunch_probe` then `mark_accepted` (Ok) or returns `CommittedRelaunchPending` (Err). Windows-gated → compiling; runtime is task #61.

## Main fresh-update flow lands WITH S60 (not seam-independent)

The `run()` fresh-update path (verify → source → execute_update → activate_and_accept) is inseparable from S60: it needs the descriptor execute-intent WRITE (DACL-gated), the concrete `relaunch_probe` closure (S60 front-door), and `verify_distribution` (Windows-gated). Build it when the windows-private-file DACL authority lands (dacl-authority-exec lane) and S60 is built. Add tokio(rt) then (the single async touch).

### Authoritative GAP-2 verify spec (Fable, confirmed) — use verbatim, do not re-derive
- The updater re-verifies IN-PROCESS (it IS the bounded helper, distribution-trust D3); `VerifiedDistributionRelease` is non-Clone/non-Serialize so nothing verified crosses the process boundary.
- `VerificationRequest::for_product_root(bundle_directory, product_root, target)`: `bundle_directory` = the NEW STAGED bundle dir (`metadata/` + `targets/`) = the verify TARGET; `product_root` = the CURRENT product root (NOT the bundle, NOT a temp) — it anchors the persistent rollback datastore + verification lock and enforces TUF version + latest-known-time monotonicity (D4 downgrade protection: a bundle older than what this root accepted fails closed); `target` = `DistributionTarget::parse(<own compiled triple>)` (closed enum, never a descriptor string).
- The staged-bundle PATH comes from the descriptor execute-intent and carries ZERO trust weight (a wrong/stale/malicious path just fails TUF vs the embedded root + product-root-anchored datastore); layout is bounds-checked inside verify.
- Two TYPED refusals (not errors to engineer around): `ProductionRootNotProvisioned` (empty embedded root; retires at the key ceremony) + `WindowsDatastoreAuthorityNotProvisioned` (retires on the windows-private-file NTFS D7 evidence). verify holds the product-root verification lock for the release lifetime (one per root; the single-updater flow satisfies it).

### Relaunch_probe closure grounding (for S60) — ground, do not invent
- Launcher: the STABLE front-door that resolves the receipt-selected generation (never a generation-specific binary), grounded against `cmd/lifecycle.rs` `spawn_detached_serve`/`wait_for_seat` + the single-app-runtime front-door.
- Probe: seat-healthy = the relaunched seat RE-PUBLISHES `gateway-discovery.json` (present + fresh) within a bounded deadline — the inverse of the drain's require-absent.
