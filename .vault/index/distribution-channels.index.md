---
generated: true
tags:
  - '#index'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
related:
  - '[[2026-07-08-distribution-channels-P01-S01]]'
  - '[[2026-07-08-distribution-channels-P01-S02]]'
  - '[[2026-07-08-distribution-channels-P01-S03]]'
  - '[[2026-07-08-distribution-channels-P01-S04]]'
  - '[[2026-07-08-distribution-channels-P01-summary]]'
  - '[[2026-07-08-distribution-channels-P02-S05]]'
  - '[[2026-07-08-distribution-channels-P02-S06]]'
  - '[[2026-07-08-distribution-channels-P02-S07]]'
  - '[[2026-07-08-distribution-channels-P02-summary]]'
  - '[[2026-07-08-distribution-channels-P03-S08]]'
  - '[[2026-07-08-distribution-channels-P03-summary]]'
  - '[[2026-07-08-distribution-channels-P04-S09]]'
  - '[[2026-07-08-distribution-channels-P04-summary]]'
  - '[[2026-07-08-distribution-channels-P05-S10]]'
  - '[[2026-07-08-distribution-channels-P05-S11]]'
  - '[[2026-07-08-distribution-channels-P05-S12]]'
  - '[[2026-07-08-distribution-channels-P05-summary]]'
  - '[[2026-07-08-distribution-channels-adr]]'
  - '[[2026-07-08-distribution-channels-plan]]'
---

# `distribution-channels` feature index

Auto-generated index of all documents tagged with `#distribution-channels`.

## Documents

### adr

- `2026-07-08-distribution-channels-adr` - `distribution-channels` adr: `scoop, cargo-binstall, and winget over the shipped artifacts - and a boundary-clean embed` | (**status:** `accepted`)

### exec

- `2026-07-08-distribution-channels-P01-S01` - move the embed folder attribute to the crate-internal staged assets/spa directory
- `2026-07-08-distribution-channels-P01-S02` - stage frontend/dist into the crate assets before the feature-on cargo build in the packaged-build recipe
- `2026-07-08-distribution-channels-P01-S03` - stage the assets in the CI build step and regenerate the release workflow through dist
- `2026-07-08-distribution-channels-P01-S04` - gitignore the staged crate assets directory
- `2026-07-08-distribution-channels-P01-summary` - `distribution-channels` `P01` summary
- `2026-07-08-distribution-channels-P02-S05` - seed the scoop manifest at the current release (versioned url, sha256 hash, bin, homepage, checkver github, autoupdate with the url.sha256 idiom)
- `2026-07-08-distribution-channels-P02-S06` - add the scoop-bump post-announce workflow (workflow_call plan input, version extraction, sha256 fetch, manifest rewrite, chore commit to main)
- `2026-07-08-distribution-channels-P02-S07` - register the post-announce job in the dist config and regenerate the release workflow
- `2026-07-08-distribution-channels-P02-summary` - `distribution-channels` `P02` summary
- `2026-07-08-distribution-channels-P03-S08` - document the scoop bucket add and cargo binstall --git install paths, replacing the crates-io-shaped binstall posture
- `2026-07-08-distribution-channels-P03-summary` - `distribution-channels` `P03` summary
- `2026-07-08-distribution-channels-P04-S09` - generate the nevenincs.vaultspec portable-zip manifests with komac and submit the winget-pkgs PR, recording the submission outcome (research-record step)
- `2026-07-08-distribution-channels-P04-summary` - `distribution-channels` `P04` summary
- `2026-07-08-distribution-channels-P05-S10` - verify the feature-on build and tests against the staged crate assets, packaged artifact serving standalone
- `2026-07-08-distribution-channels-P05-S11` - verify a real scoop install and uninstall from the in-repo bucket on this machine
- `2026-07-08-distribution-channels-P05-S12` - verify cargo binstall git-mode resolves and installs the published artifact
- `2026-07-08-distribution-channels-P05-summary` - `distribution-channels` `P05` summary

### plan

- `2026-07-08-distribution-channels-plan` - `distribution-channels` plan
