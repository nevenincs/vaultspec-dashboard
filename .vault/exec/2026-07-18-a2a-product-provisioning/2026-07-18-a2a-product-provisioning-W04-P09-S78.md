---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
body_hash: 'sha256:19401d8f56a6e632978d54a5f207c63da512f393d1208701d70b9910005e7b37'
step_id: 'S78'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Withdraw crates.io publication and bare Cargo installation metadata until a Cargo channel can preserve the composite release contract

## Scope

- `engine/crates/vaultspec-cli/Cargo.toml`

## Description

- Kept the publication withdrawal the earlier pass had already delivered, and restated its justification without the retired capsule language and without the plan and Step identifiers embedded in the comment.
- Opted the crate back into distribution explicitly, because withdrawing publication had also withdrawn the crate from release-artifact production, which the retained release tooling depends on.

## Outcome

Publication stays withheld, so neither registry install path is reachable, while the dashboard binary is planned, checksummed, and hosted for all four targets again.

## Notes

Confirming this Step exposed a live defect rather than a documentation gap. The release tool skips packages marked unpublished by default, so marking the crate unpublished had silently removed the dashboard binary, the artifact every product tree is composed around, from target planning, checksums, and release hosting. Only three helper crates were being planned. The fix was proven by re-running the planner and seeing the dashboard binary return for all four targets with its sidecar digests, and the resolved manifest was read back to confirm that publication is empty while distribution is enabled.

Formatting passes across the workspace. Workspace lint cannot pass right now for reasons outside this Step: all fifty-six errors are in the product crate's manifest and builder modules, which another lane has mid-reshape in the working tree. None are in this Step's scope, and this change alters no compiled code.
