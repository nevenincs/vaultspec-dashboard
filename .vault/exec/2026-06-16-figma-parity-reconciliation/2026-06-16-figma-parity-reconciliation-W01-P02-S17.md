---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S17'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Mirror the historical text-diff route shape in the mock engine to match the live wire byte-for-byte

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Add the `histdiff` verb to the mock `/ops/git/{verb}` whitelist, mirroring the live two-rev historical diff byte-for-byte: it requires `path` plus BOTH `from` and `to` revs (either rev missing is a 400 before any work, exactly as the live route validates), and returns a verbatim two-rev unified diff with the tiers block.
- Extend the wire client `opsGit` to accept the `histdiff` verb and the `from`/`to` rev fields so a consumer drives the historical diff through the same client path as the working-tree diff.

## Outcome

The mock historical text-diff route mirrors the live wire byte-for-byte (verb echo, verbatim two-rev unified diff, tiers block, and the same rev-and-path validation 400s). The wire client supports the new verb. The frontend lint gate (eslint, prettier, tsc, token-drift, figma-registry) is green.

## Notes

The `opsGit` client extension is the wire-client seam (the stores layer's sole network surface), not a view-store data shape change, so the preserved-contract boundary holds. The mock file lives under the testing module, not the path the plan row names.
