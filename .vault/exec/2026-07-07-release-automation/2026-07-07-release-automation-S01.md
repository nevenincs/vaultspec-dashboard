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

Config validates against the published release-please config schema (ajv, draft-07, formats plugin). Both frontier-risk mitigations from the ADR are encoded in config rather than deferred.

## Notes

- If the rust strategy also updates the same value, the two updaters write the identical version string - a harmless double-write, verified conceptually; watch on the first release PR.
