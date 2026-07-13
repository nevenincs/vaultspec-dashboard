---
tags:
  - '#plan'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-08-distribution-channels-adr]]'
  - '[[2026-07-04-dashboard-packaging-adr]]'
---

# `distribution-channels` plan

Ship the scoop, cargo-binstall, and winget channels over the published artifacts, fixing the embed's crate-boundary escape on the way.

## Description

Executes the accepted distribution-channels ADR (see related): the rust-embed target moves inside the api crate (staged assets, boundary-clean, packageable), the scoop bucket lives in this repo with an automated per-release bump through dist's post-announce seam, the README documents the scoop and binstall-git install paths, and the winget manifests are submitted manual-first. Verification installs through the real channels.

## Steps

### Phase `P01` - boundary-clean embed

Moves the rust-embed target inside the crate (staged assets/spa) so the api crate is self-contained and packageable, with the fail-loud compile error preserved.

- [x] `P01.S01` - move the embed folder attribute to the crate-internal staged assets/spa directory; `engine/crates/vaultspec-api/src/routes/spa.rs`.
- [x] `P01.S02` - stage frontend/dist into the crate assets before the feature-on cargo build in the packaged-build recipe; `justfile`.
- [x] `P01.S03` - stage the assets in the CI build step and regenerate the release workflow through dist; `.github/workflows/release-build-setup.yml`.
- [x] `P01.S04` - gitignore the staged crate assets directory; `.gitignore`.

### Phase `P02` - scoop channel

Seeds the in-repo bucket manifest and wires the automated per-release bump through dist's post-announce seam.

- [x] `P02.S05` - seed the scoop manifest at the current release (versioned url, sha256 hash, bin, homepage, checkver github, autoupdate with the url.sha256 idiom); `bucket/vaultspec.json`.
- [x] `P02.S06` - add the scoop-bump post-announce workflow (workflow_call plan input, version extraction, sha256 fetch, manifest rewrite, chore commit to main); `.github/workflows/scoop-bump.yml`.
- [x] `P02.S07` - register the post-announce job in the dist config and regenerate the release workflow; `dist-workspace.toml`.

### Phase `P03` - channel docs

Documents the scoop and cargo-binstall install paths in the README.

- [x] `P03.S08` - document the scoop bucket add and cargo binstall --git install paths, replacing the crates-io-shaped binstall posture; `README.md`.

### Phase `P04` - winget submission

Generates and submits the nevenincs.vaultspec manifests to microsoft/winget-pkgs, recording the reputation-cycle outcome.

- [x] `P04.S09` - generate the nevenincs.vaultspec portable-zip manifests with komac and submit the winget-pkgs PR, recording the submission outcome (research-record step); `.vault/exec/2026-07-08-distribution-channels`.

### Phase `P05` - verification

Proves the channels end to end: staged-asset packaged build, a real scoop install from the bucket, and a binstall git-mode resolution.

- [x] `P05.S10` - verify the feature-on build and tests against the staged crate assets, packaged artifact serving standalone; `engine/crates/vaultspec-api`.
- [x] `P05.S11` - verify a real scoop install and uninstall from the in-repo bucket on this machine; `bucket/vaultspec.json`.
- [x] `P05.S12` - verify cargo binstall git-mode resolves and installs the published artifact; `.vault/exec/2026-07-08-distribution-channels`.

## Parallelization

P01 and P02 are independent and may run in parallel; P03 follows both (it documents their results). P04 may run any time after the ADR (it targets the already-published v0.1.0). P05 runs last; its three steps are mutually independent.

## Verification

- Feature-on build and 377-test suite pass against the staged crate assets; the packaged artifact serves the embedded SPA standalone (P05.S10).
- `scoop bucket add` + `scoop install vaultspec` from this repo installs a working binary and uninstalls cleanly on this machine (P05.S11).
- `cargo binstall --git` resolves the published artifact without crates.io (P05.S12).
- `dist plan` passes the staleness check after the post-announce registration; lint gates green on every touched file.
- The winget step record states the submission outcome honestly, including any reputation-cycle friction.
- The plan is complete when every Step row is closed.
