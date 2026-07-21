---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S166'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Aggregate exactly one verified artifact for each of the five unique target triples enforce common A2A commit component-lock release-schema protocol and state identity verify every target archive manifest tree software-bill-of-materials and license evidence and emit the cohort digest that gates publication

## Scope

- `.github/workflows/release.yml`

## Description

- Authored the cohort-digest emitter, its CLI bin, and its wiring in the product-release workflow: aggregate exactly one verified member per target triple, enforce the closed five-roster and a common A2A commit / component-lock / release-schema / protocol / state identity across all members, verify each member through the S06 authority, and emit the SHA-256 of the RFC 8785 JCS cohort descriptor (via `serde_jcs`, never hand-rolled) that gates publication.

## Outcome

The cohort digest is emitted from five verified members with full identity enforcement; the Rust emitter + bin are tested green on this box.

## Notes

RESIDUAL — the emitter and bin are local-verifiable (tests green); the release-CI aggregation across the real per-target archives is release-verified. Left UNTICKED.
