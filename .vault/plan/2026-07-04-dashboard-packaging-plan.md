---
tags:
  - '#plan'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
tier: L2
related:
  - '[[2026-07-04-dashboard-packaging-adr]]'
  - '[[2026-07-04-dashboard-packaging-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `dashboard-packaging` plan

Turn the dashboard into an installable single-binary product with a pinned dist release pipeline, detect-and-instruct provisioning, and a retired legacy releaser - the v1 phase of the accepted packaging ADR.

## Description

Executes the v1 scope of the dashboard-packaging ADR (see `related:`), grounded in the packaging research. Five phases: embed the built SPA into the `vaultspec` binary behind an `embed-spa` cargo feature while retaining the dev disk passthrough (P01); add the startup detect-and-instruct probe for `git` and `vaultspec-core` and surface the component compatibility handshake through the served tiers envelope (P02); generate and pin the dist release pipeline, gated on the existing verification workflows, with the CI toolchain pinned to the repo toolchain file (P03); retire the orphaned release-please configuration and repair the stale hooks, recipes, and dependency-scope drift the research surfaced (P04); and author honest unsigned-artifact install documentation plus the two research-only channel validations the ADR carries forward (P05). Zero signing spend throughout; rag remains attach-or-instruct and is never provisioned.

## Steps

### Phase `P01` - embed the SPA into the release binary

Delivers the embed-spa cargo feature so a release build of the vaultspec binary carries the built SPA bundle, embedded-first, with the dev disk passthrough retained.

- [x] `P01.S01` - add the embed-spa cargo feature and the rust-embed dependency to the api crate; `engine/crates/vaultspec-api/Cargo.toml`.
- [x] `P01.S02` - forward the embed-spa feature from the bin crate so release builds enable it with one flag; `engine/crates/vaultspec-cli/Cargo.toml`.
- [x] `P01.S03` - implement the embedded asset store and the embedded-first resolution chain (embedded, then VAULTSPEC_SPA_DIR, then frontend/dist, then placeholder) preserving the traversal guard, MIME map, deep-link fallback, API prefix boundary, and token injection; `engine/crates/vaultspec-api/src/routes/spa.rs`.
- [ ] `P01.S04` - add feature-gated tests covering embedded index delivery, asset MIME, deep-link fallback, API 404 boundary, and token injection; `engine/crates/vaultspec-api`.
- [ ] `P01.S05` - add a packaged-build recipe running the frontend build then the release cargo build with the embed-spa feature; `justfile`.

### Phase `P02` - startup provisioning probe and compatibility handshake

Delivers the detect-and-instruct startup probe for git and vaultspec-core and surfaces the component handshake honestly through the served tiers envelope.

- [ ] `P02.S06` - probe git presence at serve startup with a bounded git version run and fail closed with plain remediation prose; `engine/crates/vaultspec-api/src/lib.rs`.
- [ ] `P02.S07` - probe vaultspec-core capability and the 0.1.36 floor at serve startup reusing the existing runner resolution and emit the exact uv tool install remediation; `engine/crates/vaultspec-api/src/lib.rs`.
- [ ] `P02.S08` - surface the component handshake (declared floors, probed versions, degraded flags for core and rag) through the served tiers envelope; `engine/crates/vaultspec-api`.
- [ ] `P02.S09` - add engine tests proving missing git, stale core, and absent rag each degrade honestly in the tiers block; `engine/crates/vaultspec-api`.
- [ ] `P02.S10` - consume the handshake fields through the existing stores tiers reader so stale-core blocks authoring verbs and absent rag greys semantic panels; `frontend/src/stores/server`.

### Phase `P03` - dist release pipeline

Delivers the pinned dist-generated release workflow producing installers, binstall metadata, and checksummed GitHub Releases artifacts, gated on the existing verification jobs with the CI toolchain pinned.

- [ ] `P03.S11` - run dist init and commit the pinned dist configuration (win, macos, linux targets, shell and powershell installers, binstall metadata, checksums, GitHub Releases hosting, install receipts, user-invoked updates only); `dist-workspace.toml`.
- [ ] `P03.S12` - adapt the generated release workflow to build the frontend before the cargo build, enable the embed-spa feature, and gate publishing on the verification jobs; `.github/workflows/release.yml`.
- [ ] `P03.S13` - pin the CI toolchain to the repo rust-toolchain.toml instead of stable in the engine workflow; `.github/workflows/engine-ci.yml`.
- [ ] `P03.S14` - pin the CI toolchain to the repo rust-toolchain.toml instead of stable in the quality-gates workflow; `.github/workflows/quality-gates.yml`.
- [ ] `P03.S15` - dry-run the release pipeline from a branch tag and verify a produced artifact installs and serves the embedded SPA standalone in a clean directory; `.github/workflows/release.yml`.

### Phase `P04` - releaser and manifest cleanup

Retires the orphaned release-please configuration and repairs the stale hooks, recipes, and dependency-scope drift the packaging research surfaced.

- [x] `P04.S16` - remove the orphaned python-typed release-please configuration in favor of the dist tag-driven flow; `release-please-config.json`.
- [x] `P04.S17` - fix or remove the dormant CHANGELOG guard hook that assumes release-please runs; `.pre-commit-config.yaml`.
- [x] `P04.S18` - repair the stale prod namespace reference in the ci recipe; `justfile`.
- [x] `P04.S19` - reconcile the dependency-scope drift between the runtime vaultspec-rag pin and the dev-group pin; `pyproject.toml`.

### Phase `P05` - install docs and channel validations

Delivers honest install documentation for unsigned artifacts and closes the two research validations the ADR carries forward.

- [ ] `P05.S20` - author the install section covering GitHub Releases, install scripts, cargo-binstall, checksum verification, and the SmartScreen and Gatekeeper friction stated plainly; `README.md`.
- [x] `P05.S21` - validate winget acceptance of unsigned hash-pinned manifests and record the finding in the step record (research only); `.vault/exec/2026-07-04-dashboard-packaging`.
- [x] `P05.S22` - assess SignPath Foundation free OSS signing eligibility and record the finding in the step record (research only); `.vault/exec/2026-07-04-dashboard-packaging`.

## Parallelization

P01 and P02 are independent and may run in parallel; both touch `engine/crates/vaultspec-api` but on disjoint files except the shared crate area, so land P01.S03 before P02.S08 if the same executor holds both. P03 hard-depends on P01 (the release workflow builds with the embed-spa feature): P03.S11 through P03.S14 may start once P01.S01 and P01.S02 exist, but P03.S15 (the dry run) requires all of P01 and P03.S11 through P03.S14 closed. P04 is independent of everything and may run at any time. P05.S20 requires P03.S11 (the installer set must exist to document); P05.S21 and P05.S22 are research-only and fully parallel from the start. Within phases, steps are sequential except where a step names a distinct file (P03.S13 and P03.S14 are parallel; P04 steps are all parallel).

## Verification

- The full lint gate passes for every touched language: `just dev lint all` exits 0 (dev-workflow rule; declaring green requires the full gate).
- `cargo test --workspace` passes with and without the embed-spa feature; the feature-gated P01.S04 tests pass under `--features embed-spa`.
- The frontend suite passes live against the real serve origin (`just dev test frontend`), including the tiers-reader consumption of the handshake fields (P02.S10).
- A dry-run release from a branch tag (P03.S15) produces installers and checksums, and the installed binary serves the embedded SPA standalone from a clean directory with no `frontend/dist` on disk, with the placeholder page unreachable.
- With `vaultspec-core` absent from PATH and uv, serve fails closed printing the exact `uv tool install vaultspec-core` remediation; with rag absent, semantic panels degrade fail-closed while the rest of the dashboard serves (P02).
- `release-please-config.json` is gone, the pre-commit CHANGELOG hook no longer references a releaser that never runs, and `just ci` executes end to end (P04).
- The two research-only validations (P05.S21, P05.S22) each have a step record stating the finding and its source.
- The plan is complete when every Step row is closed (`- [x]`).
