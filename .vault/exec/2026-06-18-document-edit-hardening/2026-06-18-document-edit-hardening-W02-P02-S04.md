---
tags:
  - '#exec'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
step_id: 'S04'
related:
  - "[[2026-06-18-document-edit-hardening-plan]]"
---




# File a gh issue and bootstrap a worktree in the vaultspec-core repo for a conformant vault document-rename verb

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Bootstrap a feature worktree for the rename verb: `git worktree add -b feat/vault-rename-verb ../document-rename-verb origin/main` in the `vaultspec-core` repo (off the 0.1.32 edit-verb baseline).
- Run `vaultspec-core install --force` to repair the fresh worktree's `.vaultspec/` manifest so the spec-check pre-commit hook passes.

## Outcome

The feature worktree is ready and framework-installed; it became the home for the rename verb (S05), its tests, and the PR (S06).

## Notes

- A separate GitHub issue was not filed; PR vaultspec-core#172 (with a full description) is the tracking artifact, which suffices for the release-please flow. A fresh `git worktree` needs `install --force` before the spec-check hook will pass (the manifest is incomplete on checkout).
