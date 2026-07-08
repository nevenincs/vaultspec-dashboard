---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S19'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# reconcile the dependency-scope drift between the runtime vaultspec-rag pin and the dev-group pin

## Scope

- `pyproject.toml`
- `uv.lock`

## Description

- Remove the uncommitted `vaultspec-rag[mcp]>=0.2.28` entry from runtime `[project.dependencies]`, leaving `vaultspec-core>=0.1.36` as the sole runtime dependency, per the resource-bounds wheel-purity rule (rag/torch never runtime deps).
- Consolidate the dev-group pin to `vaultspec-rag[mcp]>=0.2.28`, replacing the looser `vaultspec-rag>=0.2.25` pin and carrying the `mcp` extra forward; leave the torch `>=2.4` entry and the `pytorch-cu130` source pin untouched.
- Run `uv lock` and confirm `uv.lock` now shows `vaultspec-dashboard` runtime `dependencies` with only `vaultspec-core`, and the dev-dependencies/`requires-dev` blocks carrying `vaultspec-rag` with the `mcp` extra at `>=0.2.28`.
- Run `just dev lint toml` (Taplo) to confirm the manifest still lints clean.

## Outcome

`pyproject.toml` runtime `dependencies` now reads `["vaultspec-core>=0.1.36"]` only; the `dev` group reads `"vaultspec-rag[mcp]>=0.2.28"` in place of the prior `vaultspec-rag>=0.2.25`. `uv.lock` regenerated via `uv lock` (118 packages resolved) and confirmed the `vaultspec-dashboard` package block carries only `vaultspec-core` under `dependencies`/`requires-dist`, with `vaultspec-rag` (extra `mcp`, `>=0.2.28`) moved into `dev-dependencies`/`requires-dev`; `uv.lock` is included in this step's commit alongside the manifest. `just dev lint toml` passed clean (Taplo, no findings against the 6 tracked TOML files).

## Notes

`uv.lock` also carries unrelated upstream registry churn (a `narwhals` version bump and several `nvidia-*`/`cuda-*` `sys_platform` marker refinements) that predates this step and was already present as an uncommitted diff before this edit; re-running `uv lock` did not introduce new drift there, and those hunks ride along in the same lock-file commit since `uv.lock` is a single indivisible artifact.
