---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S156'
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
     The S156 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Implement the Scoop authority adapter by invoking only phase-zero-proven Scoop manager commands for pinned complete archives and never writing Scoop-owned apps, shims, cache, or bucket state and ## Scope

- `engine/crates/vaultspec-product/src/channels/scoop.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the Scoop authority adapter by invoking only phase-zero-proven Scoop manager commands for pinned complete archives and never writing Scoop-owned apps, shims, cache, or bucket state

## Scope

- `engine/crates/vaultspec-product/src/channels/scoop.rs`

## Description

- Add the shared manager-authority primitives to the channels module: `PinnedArtifact` (a validated pinned complete artifact — bounded identity + lowercase SHA-256 digest, never a path), `ProvenManager` (a package manager proven present by a phase-zero preflight — construction requires a real regular-file program), and `AuthorizedManagerOperation` (a validated, ready-to-delegate descriptor naming channel + proven program + closed operation label + pinned artifact, with no file-writing authority).
- Add the Scoop channel adapter (`ScoopAuthority`): reports Scoop channel facts (manager ownership true), mints the sealed Scoop provenance, and exposes a CLOSED `ScoopOperation` set (install/update/uninstall) authorized only against a `ProvenManager` and a `PinnedArtifact` — no free-form Scoop command is representable and there is no API here that writes a Scoop-owned app, shim, cache, or bucket file.
- Add unit tests: shared artifact/proven-manager validation, Scoop channel/provenance facts, and closed-operation authorization producing the right descriptor.

## Outcome

Delivered `src/channels/scoop.rs` (+ tests) and the shared manager primitives in `src/channels.rs`. Full product gate green: build, `cargo test -p vaultspec-product` (129 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Landed as one buildable slice with the WinGet (S157) and MSI (S158) sibling adapters, which share the same `PinnedArtifact`/`ProvenManager`/`AuthorizedManagerOperation` infrastructure; each step has its own execution record and plan tick. The managers are absent in CI, so actual delegation/execution is deferred to the external updater (W03.P07/W04) where the real manager CLI contract is pinned; this step delivers the validated operation descriptors, sealed provenance, and phase-zero proven-manager gate — not invented scoop argv. No scaffolds or skipped work.
