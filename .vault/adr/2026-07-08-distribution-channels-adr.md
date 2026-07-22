---
tags:
  - '#adr'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-21'
related:
  - "[[2026-07-04-dashboard-packaging-adr]]"
  - "[[2026-07-04-dashboard-packaging-research]]"
  - "[[2026-07-07-release-automation-adr]]"
  - "[[2026-07-18-a2a-product-provisioning-adr]]"
---

# `distribution-channels` adr: `scoop, cargo-binstall, and winget over the shipped artifacts - and a boundary-clean embed` | (**status:** `accepted`)

## Problem Statement

v0.1.0 is published on GitHub Releases with installers and checksums, and the repo is public. Three further channels are wanted - scoop, cargo, winget - and dist generates none of them (its installer set is shell, powershell, npm, homebrew, msi), so each rides the existing artifacts as an authored manifest. The cargo channel also exposed an architectural defect: the `embed-spa` feature's rust-embed folder is `../../../frontend/dist`, OUTSIDE the `vaultspec-api` crate boundary, so the crate is not packageable - `cargo package` cannot include an escaping path, and a source build without the staged asset would silently produce the placeholder-serving binary. This record decides the three channel mechanisms and the bundleability architecture.

## Considerations

- Scoop resolves a bucket's manifests from a `bucket/` subdirectory of ANY git repo (`Find-BucketDirectory` in scoop's `lib/buckets.ps1`), so the manifest can live in this repo - one repo, one PR surface. `scoop update` reads the COMMITTED manifest (a git pull of the bucket); `checkver`/`autoupdate` serve maintainer tooling only, so each release must bump the committed manifest.
- dist 0.32 exposes `post-announce-jobs = ["./job"]` - a `workflow_call` job appended AFTER the GitHub Release publishes ("guaranteed to run after everything else"), receiving the dist plan JSON as a declared `plan` input. That is the sanctioned seam for a per-release manifest bump; hand-editing `release.yml` stays forbidden (the plan job's staleness check).
- cargo-binstall's `--git <repo>` clones the repo for the manifest instead of crates.io, then runs its normal GitHub-releases probes: path `{repo}/releases/download/v{version}/` times filename `{name}-{target}{archive-suffix}` - an EXACT match for dist's deliberately versionless `vaultspec-cli-x86_64-pc-windows-msvc.zip` under our v-plain tags. Compatible by construction (dist's own book/changelog state the naming is chosen for binstall's expectations); no `[package.metadata.binstall]` needed.
- rust-embed 8.11 (read from `rust-embed-impl` source): a relative `folder` resolves from `CARGO_MANIFEST_DIR` at derive time; a missing folder is a COMPILE ERROR unless `allow_missing`; the `interpolate-folder-path` feature shellexpands `$VAR` forms with interpolation failure as a compile error. Our `debug-embed` feature already forces compile-time embedding in every profile.
- The winget channel was validated in the packaging research (unsigned hash-pinned portable/zip manifests accepted; the gate is the AV/reputation scan, with documented false-positive precedent) and was blocked only on repo visibility, now public.
- The product is an application, not a library: `cargo install` from crates.io would demand publishing all twelve workspace crates in dependency order under the single workspace version, and buys end users nothing the installers, scoop, and binstall do not already provide.

## Considered options

- **Scoop manifest in THIS repo (`bucket/vaultspec.json`) - CHOSEN.** One repo, `scoop bucket add vaultspec <repo-url>`; freshness via a dist post-announce job committing the bump. A separate bucket repo - rejected: a second repo to maintain for one file. Submission to scoop main/extras - deferred: notability bar and external review for no added control.
- **Per-release manifest bump via `post-announce-jobs` - CHOSEN.** The job extracts the released version from the dist plan input, downloads the published `.sha256`, rewrites `bucket/vaultspec.json`, and commits to main as a `chore(scoop):` (changelog-hidden, so release-please ignores it). Manual bumping - rejected: exactly the human ritual the release-automation ADR retired.
- **Boundary-clean embed: stage the SPA INSIDE the crate (`crates/vaultspec-api/assets/spa/`, gitignored, copied from `frontend/dist` by the packaged-build recipe and the CI build-setup) with `#[folder = "assets/spa"]` - CHOSEN.** The crate becomes self-contained and packageable (a Cargo.toml `include` whitelist captures staged assets at publish time, overriding gitignore); the missing-folder compile error preserves fail-loud when the feature is on and staging was skipped. Keeping the escaping `../../../frontend/dist` path - rejected: unpackageable and a standing boundary smell. An env-var interpolated folder (`$VAULTSPEC_SPA_DIST` via `interpolate-folder-path`) - rejected as the primary (an env-shaped build input is less discoverable than a staged directory), noted as a compatible future override.
- **cargo channel = documented cargo-binstall over the workspace manifest - CHOSEN (amended at execution).** The `--git` form was REFUTED empirically: binstall's git mode reads the manifest at the CLONE ROOT and our cargo workspace lives under `engine/`, so it fails with a missing-manifest error. The verified working form is a shallow clone plus `cargo binstall --manifest-path <clone>/engine vaultspec-cli`, which resolved and fetched the published v0.1.0 artifact in a dry run (binstall's default versionless probes matched dist's naming exactly, as predicted). Full crates.io publishing - REJECTED for the foreseeable future: a twelve-crate publish chain, publish-order and version-sync ceremony, and a source-build channel for an application whose binaries are already served; the staged-assets design keeps the door open if this ever reverses.
- **winget: manual komac-generated first submission under identifier `nevenincs.vaultspec` (portable zip, nested `vaultspec.exe`) - CHOSEN**, automation deferred. WinGet Releaser automation from day one - rejected: prove the manifest and clear the first-submission Defender-reputation cycle manually before adding a fork plus PAT surface.

## Constraints

- The scoop-bump job must be a `workflow_call` workflow declaring the `plan` input itself; the released version is extracted from the plan JSON (dist passes no dedicated tag input). Its push to main needs `contents: write` and must use a changelog-hidden commit type so release-please treats it as noise.
- The scoop manifest must pin VERSIONED asset URLs (never `latest/download`) so `url`+`hash` stay atomic per release; `checkver: github` requires `homepage` set to the repo URL; `bin` names the real executable `vaultspec.exe`.
- `autoupdate.hash.url = "$url.sha256"` relies on scoop's built-in bare-hex regex against our per-asset `.sha256` files - the exact documented idiom (openjdk uses it verbatim); no custom `find`/`mode`.
- The staged `assets/spa/` directory is a build product: gitignored, produced by `just dev build package` and the CI `release-build-setup.yml` step, and REQUIRED at compile time whenever `embed-spa` is on (compile error otherwise - the same honesty the escaping path had).
- binstall WITHOUT `--git` resolves via crates.io and will not find the package; only the `--git` form is documented. The claim "binstall supports dist out of the box" is cited to dist's own book/changelog (compatible by construction), not to binstall prose.
- Winget first submission carries reputation-scan latency and possible manual Defender false-positive remediation (RustDesk precedent); the manifest must point at versioned release assets and install/uninstall silently (portable zip qualifies).

## Implementation

High-level layering only.

- **Boundary-clean embed.** Move the rust-embed folder to `assets/spa` inside `engine/crates/vaultspec-api` (crate-relative, compile-time, fail-loud). The packaged-build recipe and the injected CI build step gain one copy step: `frontend/dist` into `engine/crates/vaultspec-api/assets/spa`. `.gitignore` covers the staged directory; `spa.rs` serving logic is untouched (only the derive attribute's folder changes).
- **Scoop.** Seed `bucket/vaultspec.json` at the current release (version, versioned zip URL, hash from the published `.sha256`, `bin: vaultspec.exe`, `homepage`, `checkver: github`, `autoupdate` with `$url.sha256`). Add `.github/workflows/scoop-bump.yml` (`workflow_call` with the `plan` input; extracts version, fetches the new `.sha256`, rewrites the manifest, commits `chore(scoop): ...` to main) and register it via `post-announce-jobs = ["./scoop-bump"]` in `dist-workspace.toml`, regenerating `release.yml` through dist.
- **Cargo.** Document `cargo binstall --git https://github.com/nevenincs/vaultspec-dashboard vaultspec-cli` in the README install section, replacing the removed binstall line, with the crates.io posture recorded here.
- **Winget.** Generate `nevenincs.vaultspec` manifests with komac against the published release, submit the PR to microsoft/winget-pkgs, and carry the reputation-cycle caveat; revisit WinGet Releaser automation after the first merge.

## Rationale

Every channel rides the artifacts the pipeline already publishes - no second build path, no signing spend, consistent with the packaging ADR's zero-budget posture. The in-repo bucket keeps scoop inside the one-repo governance the owner asked for, and the post-announce seam keeps its freshness automated without hand-editing generated CI. The bundleability fix is taken now, decoupled from any crates.io ambition, because a crate whose compiled contents depend on a path outside its own boundary is a defect regardless of packaging plans - staging inside the crate removes the smell, preserves the fail-loud compile error, and happens to make the crate publishable if that posture ever changes. binstall-via-git delivers the cargo-native audience immediately at zero publishing cost, which is the honest cost-benefit for an application. Winget goes manual-first because the one genuinely external gate (reputation review) is best cleared before wiring automation around it.

## Consequences

- Windows users gain `scoop bucket add vaultspec ...` + `scoop install vaultspec` and, once the winget PR merges, `winget install nevenincs.vaultspec`; Rust users gain a documented one-liner with no crates.io dependency.
- Each release now also commits one bot bump to main (the scoop manifest); the bucket is exactly as fresh as the last successful post-announce job, and a failed job leaves scoop one release behind - visible in the workflow run, not silent.
- The embed becomes boundary-clean at the cost of one extra copy step in two build paths; a stale staged directory can no longer serve silently wrong assets in dev because dev builds do not enable the feature, and release builds fail compile without staging.
- crates.io remains deliberately unserved; if user demand ever materializes, the recorded path is the staged-assets `include` plus a twelve-crate publish chain - a conscious future project, not drift.
- The winget identifier and the bucket become small public contracts to maintain (renames are breaking for users).
- **Partially amended (2026-07-18) by `2026-07-18-a2a-product-provisioning-adr`:** Scoop now installs the complete Windows ZIP (dashboard plus A2A capsule) rather than the binary-only zip recorded here, WinGet moves from the portable-ZIP manifest decided here to the complete product MSI, and the documented Cargo `binstall`/`cargo install` channel is withdrawn until composite receipts are supported. Each change is gated on that ADR's own phase-zero artifact-level certification proofs before it ships; the manifest-governance and staged-SPA decisions recorded here stand.
