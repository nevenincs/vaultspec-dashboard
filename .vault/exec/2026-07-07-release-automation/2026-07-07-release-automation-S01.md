---
tags:
  - '#exec'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S01'
related:
  - "[[2026-07-07-release-automation-plan]]"
---

# author the rust-typed release-please config: path engine, include-component-in-tag false so tags stay v-plain for the dist trigger, pre-1.0 bump rules, changelog sections, and a toml jsonpath extra-file bumping the workspace.package.version in the virtual engine manifest

## Scope

- `release-please-config.json`

## Description

- Author the manifest-mode release-please config: package path `engine`, release-type rust, package-name vaultspec-dashboard
- Set `include-component-in-tag: false` so minted tags are plain v-semver, matching the dist trigger pattern and dist's tag-to-package resolution
- Set pre-1.0 bump rules (`bump-minor-pre-major`, `bump-patch-for-minor-pre-major`) and the changelog sections the retired config used (feat/fix/perf visible, docs/chore/ci/refactor/test hidden)
- Add the `extra-files` toml updater with jsonpath `$.workspace.package.version` on the engine manifest - the guaranteed bump for the VIRTUAL workspace manifest the rust strategy may not handle

## Outcome

Config validates against the published release-please config schema (ajv, draft-07, formats plugin). REVISED after review: release-type changed from `rust` to `simple`. Driving release-please's own updater classes against the real manifests proved the review's prediction - the rust strategy unconditionally registers its built-in `CargoToml` updater on the package root, and that updater throws "is not a package manifest" on the virtual `engine/Cargo.toml`; the strategy also leaves the glob members (`crates/*`) unexpanded, so its versions map is empty and its lock updater no-ops regardless. The `simple` strategy with `createIfMissing: false` on its version file writes NO stray `version.txt` when none exists; the changelog and the proven toml jsonpath extra-file carry the whole bump.

## Notes

- Lock posture, verified empirically: the generic toml updater's jsonpath filters do not match lockfile array entries ("No entries modified"), so the release PR cannot bump `engine/Cargo.lock` - and does not need to. A stale-lock `dist build` was run for real (workspace at 0.1.1, lock at 0.1.0): exit 0, cargo auto-reconciled the 13 member versions during the build. Nothing in the pipeline builds `--locked`. The lag is benign drift documented in the README; the refreshed lock rides the next commit that touches it.
