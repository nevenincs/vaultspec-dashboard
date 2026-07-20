---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S176'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
  - "[[2026-07-20-a2a-provisioning-authority-adr]]"
  - "[[2026-07-20-a2a-distribution-trust-adr]]"
---

# Implement sealed provisioning and active-release facades that consume TUF-verified distribution exact installation-lock and unpublished-generation authority plus pending or existing ownership proof, derive private manifest and receipt facts, publish only through the fixed journal, expose non-authorizing settled observation, and preserve every exact authority across bounded retry or recovery

## Scope

- `engine/crates/vaultspec-product/src/provisioning.rs`
- `engine/crates/vaultspec-product/src/lib.rs`
- `engine/crates/vaultspec-product/src/manifest.rs`
- `engine/crates/vaultspec-product/src/manifest/authority.rs`
- `engine/crates/vaultspec-product/src/receipt.rs`
- `engine/crates/vaultspec-product/src/receipt/publish.rs`
- `engine/crates/vaultspec-product/src/bootstrap.rs`
- `engine/crates/vaultspec-product/src/credentials.rs`
- `engine/crates/vaultspec-product/src/credentials/unix.rs`
- `engine/crates/vaultspec-product/src/credentials/windows.rs`
- `engine/crates/vaultspec-product/src/lifecycle.rs`
- `engine/crates/vaultspec-product/Cargo.toml`

## Description

- Expose only bounded, guard-bound, non-authorizing fixed-receipt observations.
- Keep settled receipt facts as observations and future baseline inputs; never reinterpret receipt channel or ownership facts as adapter provenance.
- Make existing-update preparation return only an `Infallible` success type or the closed `AdapterUnavailable` diagnostic until a product-owned update adapter validates an owner-private provenance descriptor.
- Make first-install preparation return only an `Infallible` success type or the closed `FirstInstallAdapterUnavailable` diagnostic until a product-owned install adapter validates the complete bootstrap descriptor.
- Remove the receipt-derived transaction, successful prepare/commit, and retry APIs so no caller can substitute a raw channel, actor label, or copied-updater identity for opaque adapter authority.
- Keep the complete-generation verification substrate crate-private and compile-time sealed behind a module-private adapter token; only real-behavior tests in the defining module can construct that token today.
- Preserve opaque fixed-journal mutation authority when an indeterminate observation error requires explicit recovery.

## Outcome

OPEN / GATED. The fixed-receipt observation facade is implemented. Both existing-update and first-install preparation are intentionally and statically unavailable: their public success type is `Infallible`, and their typed diagnostics distinguish `AdapterUnavailable` from `FirstInstallAdapterUnavailable`. No production activation path exists until a real adapter seals provenance and a durable descriptor validator binds that authority to the intended receipt.

## Notes

- `cargo check -p vaultspec-product --tests` passed cleanly after the S175 and S176 surfaces froze.
- Focused provisioning tests passed 3/3: absent observation with both typed gates, a real settled fixed receipt that remains unable to authorize an update, and cross-product guard refusal.
- `cargo clippy -p vaultspec-product --lib -- -D warnings` passed cleanly.
- Exact-symbol review confirms no `ProvisioningTransaction`, successful preparation type, raw `Channel` construction, or `Actor::CopiedUpdater` substitution remains in the provisioning module.
- Windows descriptor retirement is still gated; the future state shape exists but does not yet retain equivalent directory authority.
- PreparedBoth crash recovery remains a prerequisite for full activation closure.
- S175 separately owns lifecycle migration away from legacy `receipt.json`, removal and repair mutation authority, coherent credential-directory authority, concurrent bootstrap exclusion, receipt-aware descriptor recovery, and API operation-lifetime authority.
- No complete preparation, commit, or retry integration proof can be written without a production construction route for adapter provenance and the retained verified distribution authority. No fake, mock, test-only public constructor, or raw authority seam was added.
