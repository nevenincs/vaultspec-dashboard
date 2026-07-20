---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S158'
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
     The S158 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Implement the MSI authority adapter by delegating install, upgrade, downgrade, rollback, repair, and removal to Windows Installer with candidate and retained prior product packages and never rewriting installer-owned files and ## Scope

- `engine/crates/vaultspec-product/src/channels/msi.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the MSI authority adapter by delegating install, upgrade, downgrade, rollback, repair, and removal to Windows Installer with candidate and retained prior product packages and never rewriting installer-owned files

## Scope

- `engine/crates/vaultspec-product/src/channels/msi.rs`

## Description

- Add the MSI (Windows Installer) channel adapter (`MsiAuthority`): reports MSI channel facts (manager ownership true — the Windows Installer owns activation and rollback), mints the sealed MSI provenance, and exposes the CLOSED `MsiOperation` set — install, upgrade, downgrade, rollback, repair, and remove — authorized only against a phase-zero `ProvenManager` and a `PinnedArtifact` (a candidate or retained-prior product package). No free-form installer command is representable and no installer-owned file is rewritten here.
- Add unit tests: MSI channel/provenance facts and authorization of the full closed installer operation set, each producing the right descriptor.

## Outcome

Delivered `src/channels/msi.rs` (+ tests) over the shared manager primitives introduced with S156. Full product gate green: build, `cargo test -p vaultspec-product` (129 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Landed in the same buildable slice as the Scoop (S156) and WinGet (S157) sibling adapters. Delegation to the Windows Installer (install/upgrade/downgrade/rollback/repair/removal) is deferred to the external updater (W03.P07/W04) where the installer contract is pinned; this step delivers the validated operation descriptors, sealed provenance, and phase-zero proven-manager gate. No scaffolds or skipped work.
