---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S65'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Reject unpinned or floating inputs, A2A commit or artifact mismatch, target mismatch, missing payloads, digest drift, incomplete licenses, and release-set skew with real composed trees

## Scope

- `engine/crates/vaultspec-product/tests/product_build.rs`

## Description

- Real-composed-tree failure proofs for the builder: unpinned or floating inputs, A2A commit or artifact mismatch, target mismatch, missing payloads, digest drift, incomplete licenses, and release-set skew are each rejected as typed fail-closed errors against actually-composed trees (never a mocked input).

## Outcome

The builder's fail-closed behavior is proven against real composed trees; APPROVED, tests green on this box.

## Notes

No residual — local-verifiable and reviewed.
