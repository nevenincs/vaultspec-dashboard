---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# `dashboard-packaging` `P04` summary

All four steps closed. The orphaned python-typed `release-please-config.json` is gone (D7; nothing ever invoked it), the dormant CHANGELOG guard hook removed, the broken `just ci` recipe genuinely fixed (`just prod` never existed; now `uv run --no-sync vaultspec-core vault check all`), and the dependency scopes reconciled wheel-pure: runtime deps are `vaultspec-core>=0.1.36` only, with `vaultspec-rag[mcp]>=0.2.28` and torch consolidated in the dev group and the cu130 source pin intact.

- Deleted: `release-please-config.json`
- Modified: `.pre-commit-config.yaml`, `justfile`, `pyproject.toml`, `uv.lock`

## Description

Commits: S16 `b6790b3e2c`, S17 `9bcddfe3c3`, S18 `454bf07134`, S19 `f7b4dfecf5`, executed by a dispatched low-executor. Review verdict: PASS (pass-with-nits), no CRITICAL or HIGH; both nits (add `--no-sync` to the ci recipe for CI cost/reproducibility, drop the two dead CHANGELOG exclude clauses) were applied in `b48d270955`. The S19 runtime-rag drift was uncommitted working-tree state, so the removal is invisible in the commit diff - the step record is the source of truth; the incidental `uv.lock` churn (narwhals bump, nvidia marker refinements) is upstream registry noise confined to the dev subtree and was kept deliberately.
