---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S06'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Parse and verify the tracked component lock, the A2A-emitted schemas/desktop-capsule-manifest.json contract, and the complete release-set manifest while rejecting unpinned identities, target mismatch, digest drift, and floating latest selectors

## Scope

- `engine/crates/vaultspec-product/src/manifest.rs`

## Description

- Model the three pinning documents as serde types in `manifest.rs`:
  `ComponentLock` (the dashboard-owned lock), `CapsuleManifest` (the A2A-emitted
  `desktop-capsule-manifest.json` contract), and `ReleaseSetManifest` (the
  dashboard release set), plus a closed `Target` triple enum.
- Add fail-closed field validators — `require_exact_version`, `require_commit`,
  `require_digest`, `expect_eq` — and a `ManifestError` enum naming each concrete
  rejection.
- Implement `parse` self-verification for all three documents and
  `verify_against_lock` cross-checks that join the capsule and release set to the
  lock's pinned commit, release identity, and per-target CPython/Node/ACP
  digests.
- Reject unpinned identities (short or non-hex commits), floating `latest`,
  wildcard, and range selectors, target mismatch, and digest drift.

## Outcome

The production parser reads the real committed component lock (via `include_str!`
in tests) and verifies matching capsule and release-set instances, while a
floating selector, unpinned commit, target mismatch, or drifted digest each
fails closed with its specific `ManifestError` variant.

## Notes

The capsule manifest and release-set schema files in the repo are JSON Schemas,
not instances, so verification is proven against real instances built from the
committed lock's pins rather than the schema documents themselves.
