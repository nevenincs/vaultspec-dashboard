---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S12'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# verify cargo binstall git-mode resolves and installs the published artifact

## Scope

- `.vault/exec/2026-07-08-distribution-channels`

## Description

- Dry-run cargo-binstall 1.20.1 in git mode and manifest-path mode against the published release

## Outcome

The ADR's `--git` form was REFUTED: git mode requires a clone-ROOT manifest and ours lives under `engine/`, so it fails with missing-manifest. The verified channel is `cargo binstall --manifest-path <clone>/engine vaultspec-cli`: resolved v0.1.0, downloaded the real GitHub artifact (dist's versionless naming matched binstall's default probes exactly), and planned `vaultspec.exe -> ~/.cargo/bin`. README and the ADR's Considered-options row were amended to the verified form.

## Notes

- A repo-root cargo workspace would restore the --git one-liner, but relocating the workspace root has a blast radius (lockfile, target dir, toolchain detection, dist members) far beyond the UX gain; not pursued.
