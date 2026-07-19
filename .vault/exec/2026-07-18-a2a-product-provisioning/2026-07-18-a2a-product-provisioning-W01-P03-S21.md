---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S21'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Export the dedicated lifecycle route module without adding any orchestration run verb

## Scope

- `engine/crates/vaultspec-api/src/routes/mod.rs`

## Description

- Export the dedicated `a2a_lifecycle` route module from the routes module tree.

## Outcome

The lifecycle route module is exported; it declares only status/run/job handlers
and adds NO orchestration run verb — the fixed five-verb `/ops/a2a` surface is
untouched.

## Notes

None.
