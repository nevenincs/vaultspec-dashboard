---
tags:
  - '#exec'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-06-18-document-edit-hardening-plan]]"
---

# Land the rename verb via PR with green CI, release the wheel, and bump the dashboard core pin

## Scope

- `pyproject.toml`

## Description

- Push `feat/vault-rename-verb` and open PR vaultspec-core#172; CI passed every code check (Tests, Lint/Type/Config/Markdown, Vault Audit, Windows Vault Repair, Workflow Lint).
- Squash-merge #172 to core `main` (conventional `feat:`), driving release-please to open release PR #173.
- Merge #173; release-please tagged `vaultspec-core-v0.1.33` and the Publish workflow uploaded 0.1.33 to PyPI (verified present).
- Bump the dashboard runtime pin `vaultspec-core>=0.1.33` and `uv lock --upgrade-package vaultspec-core` (uv.lock now resolves 0.1.33, 129 packages); committed `e25e2fd`.

## Outcome

The vault rename verb is RELEASED (vaultspec-core 0.1.33 on PyPI) and the dashboard pins it. Component (2)'s core capability is fully shipped: authored + unit-tested + live-proven + released + pinned. The dashboard's engine (which brokers `uv run vaultspec-core`) will resolve the rename verb on its next env sync.

## Notes

- The PR's `Dependency Audit (uv audit)` check is RED, but it is PRE-EXISTING and repo-wide (the 0.1.32 release run failed it too, after an advisory appeared past the last green run on 2026-06-13); dependabot PR vaultspec-core#170 is the fix, owned by the maintainer. It is not a required check (PR merge state was UNSTABLE, not BLOCKED) and does not block releases (0.1.32 published despite it). My change touched no dependencies.
- The dashboard env was NOT force-synced to 0.1.33 (the lock is updated); a `uv sync` aligns the installed env when the engine rename broker (W02.P03) lands - there is no functional benefit before the broker exists. [project] runtime deps remain rag/torch-free.
