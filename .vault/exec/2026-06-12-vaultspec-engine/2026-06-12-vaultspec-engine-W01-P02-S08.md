---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S08'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement local-branch enumeration with advisory default, feature and other classification and a lazy cached corpus-diff confirmation hook

## Scope

- `engine/crates/ingest-git/src/branches.rs`

## Description

- Implement local-branch enumeration with advisory classification: default (from HEAD or config override), feature (anything else, per the ADR default heuristic), other (configurable name prefixes).
- Implement `FeatureConfirmation`: the lazy, cached corpus-diff confirmation hook - callers supply the probe, the hook guarantees at-most-once probing per branch with observable probe counts.
- Test classification across all three classes and the lazy/cached contract.

## Outcome

Classification is advisory metadata, never a gate (ADR D2.3); cold start never probes a branch corpus until first ask, then caches.

## Notes

The corpus probe is a callback by design: corpus semantics belong to later phases (the ingest-git crate stays free of vault knowledge).
