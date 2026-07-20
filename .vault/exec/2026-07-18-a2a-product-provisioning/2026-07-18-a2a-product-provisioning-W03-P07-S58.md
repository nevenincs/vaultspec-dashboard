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
