---
generated: true
tags:
  - '#index'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-12'
related:
  - '[[2026-07-04-dashboard-packaging-P01-S01]]'
  - '[[2026-07-04-dashboard-packaging-P01-S02]]'
  - '[[2026-07-04-dashboard-packaging-P01-S03]]'
  - '[[2026-07-04-dashboard-packaging-P01-S04]]'
  - '[[2026-07-04-dashboard-packaging-P01-S05]]'
  - '[[2026-07-04-dashboard-packaging-P01-summary]]'
  - '[[2026-07-04-dashboard-packaging-P02-S06]]'
  - '[[2026-07-04-dashboard-packaging-P02-S07]]'
  - '[[2026-07-04-dashboard-packaging-P02-S08]]'
  - '[[2026-07-04-dashboard-packaging-P02-S09]]'
  - '[[2026-07-04-dashboard-packaging-P02-S10]]'
  - '[[2026-07-04-dashboard-packaging-P02-summary]]'
  - '[[2026-07-04-dashboard-packaging-P03-S11]]'
  - '[[2026-07-04-dashboard-packaging-P03-S12]]'
  - '[[2026-07-04-dashboard-packaging-P03-S13]]'
  - '[[2026-07-04-dashboard-packaging-P03-S14]]'
  - '[[2026-07-04-dashboard-packaging-P03-S15]]'
  - '[[2026-07-04-dashboard-packaging-P03-summary]]'
  - '[[2026-07-04-dashboard-packaging-P04-S16]]'
  - '[[2026-07-04-dashboard-packaging-P04-S17]]'
  - '[[2026-07-04-dashboard-packaging-P04-S18]]'
  - '[[2026-07-04-dashboard-packaging-P04-S19]]'
  - '[[2026-07-04-dashboard-packaging-P04-summary]]'
  - '[[2026-07-04-dashboard-packaging-P05-S20]]'
  - '[[2026-07-04-dashboard-packaging-P05-S21]]'
  - '[[2026-07-04-dashboard-packaging-P05-S22]]'
  - '[[2026-07-04-dashboard-packaging-P05-summary]]'
  - '[[2026-07-04-dashboard-packaging-adr]]'
  - '[[2026-07-04-dashboard-packaging-audit]]'
  - '[[2026-07-04-dashboard-packaging-plan]]'
  - '[[2026-07-04-dashboard-packaging-research]]'
---

# `dashboard-packaging` feature index

Auto-generated index of all documents tagged with `#dashboard-packaging`.

## Documents

### adr

- `2026-07-04-dashboard-packaging-adr` - `dashboard-packaging` adr: `installable single-binary distribution and release pipeline` | (**status:** `accepted`)

### audit

- `2026-07-04-dashboard-packaging-audit` - `dashboard-packaging` audit: `phase reviews and revision closure`

### exec

- `2026-07-04-dashboard-packaging-P01-S01` - add the embed-spa cargo feature and the rust-embed dependency to the api crate
- `2026-07-04-dashboard-packaging-P01-S02` - forward the embed-spa feature from the bin crate so release builds enable it with one flag
- `2026-07-04-dashboard-packaging-P01-S03` - implement the embedded asset store and the embedded-first resolution chain (embedded, then VAULTSPEC_SPA_DIR, then frontend/dist, then placeholder) preserving the traversal guard, MIME map, deep-link fallback, API prefix boundary, and token injection
- `2026-07-04-dashboard-packaging-P01-S04` - add feature-gated tests covering embedded index delivery, asset MIME, deep-link fallback, API 404 boundary, and token injection
- `2026-07-04-dashboard-packaging-P01-S05` - add a packaged-build recipe running the frontend build then the release cargo build with the embed-spa feature
- `2026-07-04-dashboard-packaging-P01-summary` - `dashboard-packaging` `P01` summary
- `2026-07-04-dashboard-packaging-P02-S06` - probe git presence at serve startup with a bounded git version run and fail closed with plain remediation prose
- `2026-07-04-dashboard-packaging-P02-S07` - probe vaultspec-core capability and the 0.1.36 floor at serve startup reusing the existing runner resolution and emit the exact uv tool install remediation
- `2026-07-04-dashboard-packaging-P02-S08` - surface the component handshake (declared floors, probed versions, degraded flags for core and rag) through the served tiers envelope
- `2026-07-04-dashboard-packaging-P02-S09` - add engine tests proving missing git, stale core, and absent rag each degrade honestly in the tiers block
- `2026-07-04-dashboard-packaging-P02-S10` - consume the handshake fields through the existing stores tiers reader so stale-core blocks authoring verbs and absent rag greys semantic panels
- `2026-07-04-dashboard-packaging-P02-summary` - `dashboard-packaging` `P02` summary
- `2026-07-04-dashboard-packaging-P03-S11` - run dist init and commit the pinned dist configuration (win, macos, linux targets, shell and powershell installers, binstall metadata, checksums, GitHub Releases hosting, install receipts, user-invoked updates only)
- `2026-07-04-dashboard-packaging-P03-S12` - adapt the generated release workflow to build the frontend before the cargo build, enable the embed-spa feature, and gate publishing on the verification jobs
- `2026-07-04-dashboard-packaging-P03-S13` - pin the CI toolchain to the repo rust-toolchain.toml instead of stable in the engine workflow
- `2026-07-04-dashboard-packaging-P03-S14` - pin the CI toolchain to the repo rust-toolchain.toml instead of stable in the quality-gates workflow
- `2026-07-04-dashboard-packaging-P03-S15` - dry-run the release pipeline from a branch tag and verify a produced artifact installs and serves the embedded SPA standalone in a clean directory
- `2026-07-04-dashboard-packaging-P03-summary` - `dashboard-packaging` `P03` summary
- `2026-07-04-dashboard-packaging-P04-S16` - remove the orphaned python-typed release-please configuration in favor of the dist tag-driven flow
- `2026-07-04-dashboard-packaging-P04-S17` - fix or remove the dormant CHANGELOG guard hook that assumes release-please runs
- `2026-07-04-dashboard-packaging-P04-S18` - repair the stale prod namespace reference in the ci recipe
- `2026-07-04-dashboard-packaging-P04-S19` - reconcile the dependency-scope drift between the runtime vaultspec-rag pin and the dev-group pin
- `2026-07-04-dashboard-packaging-P04-summary` - `dashboard-packaging` `P04` summary
- `2026-07-04-dashboard-packaging-P05-S20` - author the install section covering GitHub Releases, install scripts, cargo-binstall, checksum verification, and the SmartScreen and Gatekeeper friction stated plainly
- `2026-07-04-dashboard-packaging-P05-S21` - validate winget acceptance of unsigned hash-pinned manifests and record the finding in the step record (research only)
- `2026-07-04-dashboard-packaging-P05-S22` - assess SignPath Foundation free OSS signing eligibility and record the finding in the step record (research only)
- `2026-07-04-dashboard-packaging-P05-summary` - `dashboard-packaging` `P05` summary

### plan

- `2026-07-04-dashboard-packaging-plan` - `dashboard-packaging` plan

### research

- `2026-07-04-dashboard-packaging-research` - `dashboard-packaging` research: `packaging, distribution, and release pipeline`
