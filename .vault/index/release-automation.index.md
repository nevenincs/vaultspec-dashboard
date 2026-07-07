---
generated: true
tags:
  - '#index'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
related:
  - '[[2026-07-07-release-automation-S01]]'
  - '[[2026-07-07-release-automation-S02]]'
  - '[[2026-07-07-release-automation-S03]]'
  - '[[2026-07-07-release-automation-S04]]'
  - '[[2026-07-07-release-automation-S05]]'
  - '[[2026-07-07-release-automation-S06]]'
  - '[[2026-07-07-release-automation-S07]]'
  - '[[2026-07-07-release-automation-adr]]'
  - '[[2026-07-07-release-automation-plan]]'
---

# `release-automation` feature index

Auto-generated index of all documents tagged with `#release-automation`.

## Documents

### adr

- `2026-07-07-release-automation-adr` - `release-automation` adr: `release-please release PR in front of the dist tag pipeline` | (**status:** `accepted`)

### exec

- `2026-07-07-release-automation-S01` - author the rust-typed release-please config: path engine, include-component-in-tag false so tags stay v-plain for the dist trigger, pre-1.0 bump rules, changelog sections, and a toml jsonpath extra-file bumping the workspace.package.version in the virtual engine manifest
- `2026-07-07-release-automation-S02` - seed the manifest at the current workspace version for the engine path
- `2026-07-07-release-automation-S03` - add the release-please workflow on pushes to main, running the v4 action with a release token seam (PAT or App token) so the minted tag actually fires the downstream release workflow
- `2026-07-07-release-automation-S04` - restore the block-manual-changelog pre-commit guard now that a generated CHANGELOG.md returns
- `2026-07-07-release-automation-S05` - append the D7 supersession note pointing at the release-automation adr
- `2026-07-07-release-automation-S06` - reword the maintainers release process to the merge-the-release-PR ritual and name the first-release watch list
- `2026-07-07-release-automation-S07` - validate the config pair against the published release-please JSON schemas and pass the repo lint gates

### plan

- `2026-07-07-release-automation-plan` - `release-automation` plan
