---
name: published-wheel-purity
---

# Published wheel purity: vaultspec-rag and torch never become runtime dependencies

## Rule

vaultspec-dashboard's published wheel must never depend on vaultspec-rag or torch:
both live exclusively in the PEP 735 `dev` dependency group, and any tooling or
sync step that promotes them into `[project] dependencies` must be reverted before
commit.

## Why

vaultspec-rag pulls a multi-gigabyte CUDA torch backend via the `pytorch-cu130`
index pin in `[tool.uv.sources]`. The dashboard consumes rag strictly over its
loopback HTTP service at runtime (engine decision D5.2 in
`2026-06-12-dashboard-foundation-adr`), so a Python-level dependency is never
required — but rag's own installer has previously re-added torch as a runtime
dependency, silently poisoning the wheel. The constraint held through the full
foundation rollout cycle (`2026-06-12-dashboard-foundation-audit`) and is
load-bearing for the v1 success criterion "nothing in the published wheel depends
on vaultspec-rag or torch".

## How

- **Good:** `uv sync` (no `--all-groups`) installs a runtime surface with no rag
  and no torch; `uv sync --all-groups` is the explicit opt-in for local
  integration work.
- **Good:** after any `uv add`/installer/sync step that touches `pyproject.toml`,
  diff `[project] dependencies` and confirm rag/torch did not migrate out of the
  `dev` group; revert if they did.
- **Bad:** adding `vaultspec-rag` to `[project] dependencies` "because the import
  resolves locally" — the engine and dashboard talk to rag over HTTP discovery
  (`service.json`), never via Python import.

## Status

Active. Enforced by author discipline plus the pyproject comment block above the
`dev` group; a CI guard asserting the published wheel's `Requires-Dist` is
rag/torch-free is a worthwhile future hardening.

## Source

Foundation cycle audit `2026-06-12-dashboard-foundation-audit`; decisions ADR
`2026-06-12-dashboard-foundation-adr` (D5.2, packaging rows D9.1–D9.2); the
pyproject `dependency-groups` comment documenting the prior torch re-add incident.
