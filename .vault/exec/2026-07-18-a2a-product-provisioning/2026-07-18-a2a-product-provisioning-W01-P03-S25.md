---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S25'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Register the lifecycle route acceptance suite in the API test module

## Scope

- `engine/crates/vaultspec-api/src/lib_tests/mod.rs`

## Description

- Register the `a2a_lifecycle` acceptance module in the API test module tree.

## Outcome

The lifecycle acceptance suite is compiled and run with the rest of the API test
suite.

## Notes

None.
