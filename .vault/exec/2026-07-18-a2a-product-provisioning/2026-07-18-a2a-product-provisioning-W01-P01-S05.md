---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S05'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Expose only stable product contract, lifecycle, update, and build-tool modules to dashboard consumers

## Scope

- `engine/crates/vaultspec-product/src/lib.rs`

## Description

- Rewrite the crate root `lib.rs` from a placeholder doc-comment into the stable
  module surface, declaring `pub mod credentials`, `locking`, `manifest`,
  `paths`, and `receipt`.
- Document the boundary: only stable product-contract, lifecycle, and
  build-tool modules are exposed; A2A-internal Python detail stays opaque behind
  the capsule manifest, and later steps extend the same surface.

## Outcome

The crate exposes exactly the five product-authority modules delivered in this
phase and nothing A2A-internal. `cargo build -p vaultspec-product` compiles the
assembled surface clean.

## Notes

None.
