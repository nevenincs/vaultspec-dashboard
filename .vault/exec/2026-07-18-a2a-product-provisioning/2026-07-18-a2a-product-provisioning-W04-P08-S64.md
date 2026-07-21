---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S64'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Build and verify complete product trees inside dashboard-owned final-name unpublished generations from the tracked component lock A2A evidence dashboard binary updater licenses and software bill of materials

## Scope

- `engine/crates/vaultspec-product/src/bin/product_build.rs`

## Description

- Built the product-tree builder: compose the complete tree (place binaries + capsule archive + carried A2A tree-evidence + licenses + SBOM, scan, assemble, emit the member manifest) inside a dashboard-owned final-name generation layout, and SELF-VERIFY by round-tripping the DONE S06 authority (`ReleaseSetManifest::parse_and_verify`) — pins drawn from the tracked component lock, zero verifier re-implementation.
- Hardened the build scan to reuse the crate's own path-grammar validators (`validate_portable_path`, `semantic_path_key`), refuse non-UTF-8 before any lossy conversion, and cap tree depth at 32 (install's constant); a missing runtime pin is a typed error.

## Outcome

The builder composes and self-verifies complete product trees through the same authority a consumer trusts, so drift fails the build. APPROVED by review, hardened for all three advisories, real-file tests green on this box.

## Notes

No residual — the builder is local-verifiable and reviewed. The release-CI compose that drives it across the five targets is S66-S72 (separately release-verified).
