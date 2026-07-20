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
