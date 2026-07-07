---
tags:
  - '#plan'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
tier: L1
related:
  - '[[2026-07-07-release-automation-adr]]'
  - '[[2026-07-04-dashboard-packaging-adr]]'
---

# `release-automation` plan

Layer a rust-typed release-please release PR in front of the unchanged dist tag pipeline so releasing becomes one merge click.

## Description

Executes the accepted release-automation ADR: a manifest-driven release-please (typed rust, package path engine, v-plain tags so the existing dist trigger fires unchanged) maintains the standing release PR; supporting changes restore the CHANGELOG pre-commit guard, record the D7 supersession on the packaging ADR, and reword the maintainers' release ritual. The two frontier risks the ADR names (the virtual engine workspace manifest and the token tag-trigger footgun) are mitigated in config (toml jsonpath extra-file; explicit token seam) and carried onto a first-release watch list.

## Steps

- [ ] `S01` - author the rust-typed release-please config: path engine, include-component-in-tag false so tags stay v-plain for the dist trigger, pre-1.0 bump rules, changelog sections, and a toml jsonpath extra-file bumping the workspace.package.version in the virtual engine manifest; `release-please-config.json`.
- [ ] `S02` - seed the manifest at the current workspace version for the engine path; `.release-please-manifest.json`.
- [ ] `S03` - add the release-please workflow on pushes to main, running the v4 action with a release token seam (PAT or App token) so the minted tag actually fires the downstream release workflow; `.github/workflows/release-please.yml`.
- [ ] `S04` - restore the block-manual-changelog pre-commit guard now that a generated CHANGELOG.md returns; `.pre-commit-config.yaml`.
- [ ] `S05` - append the D7 supersession note pointing at the release-automation adr; `.vault/adr/2026-07-04-dashboard-packaging-adr.md`.
- [ ] `S06` - reword the maintainers release process to the merge-the-release-PR ritual and name the first-release watch list; `README.md`.
- [ ] `S07` - validate the config pair against the published release-please JSON schemas and pass the repo lint gates; `release-please-config.json`.

## Parallelization

S01 through S06 touch disjoint files and may run in any order; S02 depends on S01 only conceptually (the manifest key must match the config's package path). S07 is the closing gate and runs last.

## Verification

- The config pair validates against the published release-please JSON schemas (config and manifest).
- `just dev lint all` relevant gates pass on every touched file (toml, markdown, yaml via precommit config validation).
- `uv run --no-sync prek validate-config .pre-commit-config.yaml` succeeds with the restored guard.
- The packaging ADR carries the D7 supersession note; `vaultspec-core vault check all` stays clean for both features.
- First-release watch list is documented (README): the release PR bumps the engine workspace version and the lockfile stays consistent, and the minted tag fires `release.yml` (token seam working).
- The plan is complete when every Step row is closed.
