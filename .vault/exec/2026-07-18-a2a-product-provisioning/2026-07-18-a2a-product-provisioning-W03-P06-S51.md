---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S51'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Implement the self-install authority adapter so the copied updater creates and verifies final-name unpublished complete generations activates only by atomic complete receipt selection and retains the prior generation without a POSIX tree rename

## Scope

- `engine/crates/vaultspec-product/src/channels/self_install.rs`

## Description

- Add a `channels` module holding the sealed `InstallProvenanceAuthority` — the proof of which installer authority owns a generation's activation, carrying the channel and manager-ownership facts that gate later mutation.
- Make the provenance mint module-private to `channels`, reachable only from its channel-adapter children, so no code outside the adapters (not `manifest`, not a caller, not a candidate tree) can forge a channel's provenance; `manifest` now imports the sealed type instead of defining a field-less placeholder.
- Add the self-install channel adapter (`SelfInstallAuthority`): reports self-install channel facts (manager ownership false — the product/updater owns activation and rollback), mints the sealed self-install provenance, and creates final-name candidate generations by delegating to the retained-generation authority (no staging tree, no POSIX rename), so a prior generation is retained untouched alongside the candidate.
- Repoint the manifest sealed-verifier test to mint provenance through the sanctioned adapter rather than the retired placeholder.
- Add unit tests over real product state: self-install channel/provenance facts, final-name creation with an empty staging tree and prior-generation retention across two candidates, and foreign-guard bind refusal.

## Outcome

Delivered `src/channels.rs`, `src/channels/self_install.rs` (+ tests), and the `manifest.rs`/`lib.rs` wiring. Full product gate green: build, `cargo test -p vaultspec-product` (120 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Decision 3 (flagged to the lead): the four channel adapters are the sole sanctioned constructors of the sealed provenance. The self-install adapter owns channel identity and the final-name creation mechanism; completeness verification of the created generation (the `VerifiedReleaseSet` join) is performed by the S52 transaction over the sealed release authority, and end-to-end activation via atomic receipt selection composes there. The provenance mint and getters carry `allow(dead_code)` reasons — landed ahead of their S52 consumer per the crate's existing sealed-substrate convention. No scaffolds or skipped work.
