---
tags:
  - '#audit'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
  - "[[2026-07-04-dashboard-packaging-adr]]"
---

# `dashboard-packaging` audit: `phase reviews and revision closure`

## Scope

Consolidates the mandatory code reviews for all five phases of the packaging plan (22/22 steps), run per phase by independent reviewer personas over the landed commits, plus the revision commits their withholds required and the re-check verdicts that cleared them. Verification substrate: engine lib suites with and without the embed feature, the full live-wire frontend suite, the repo lint gates, and a twice-run end-to-end packaged-artifact verification (checksum, install, standalone serve, uninstall) on Windows.

## Findings

### spa-disk-traversal-windows | medium | the disk-serving arm's traversal guard missed Windows drive-absolute and drive-relative escapes

P01 review. Pre-existing (the `..`-only guard predates the phase); the embedded release path was immune by construction. `PathBuf::join` replaces its base for `C:/...`, `C:foo`, and UNC shapes, so a disk-source request could escape the asset root. RESOLVED in `e8c7cbd2e5`: the guard was extracted pure (`is_safe_relative` in `engine/crates/vaultspec-api/src/routes/spa.rs`) rejecting every escape shape, unit-tested across all of them.

### core-probe-unbounded | high | the core version probe ran unbounded on the new startup-gate critical path

P02 review. `core_version()` in `engine/crates/ingest-core/src/runner.rs` spawned `--version` with neither an output cap nor a deadline; P02 promoted it onto the serve startup gate, where a stuck child (a stalled cold uv resolve) would hang startup - the opposite of the detect-and-instruct intent, and a resource-bounds violation. RESOLVED in `a4ea7beb50`: rebounded with the capability-probe pattern (64 KiB cap, 30 s deadline, kill on breach, reader joined). Re-check PASS.

### declared-tier-over-degrade | medium | the frontend reader fold greyed the whole declared plane, broader than the ADR

P02 review. Folding the served `meets_floor: false` into `degraded` greyed functional read surfaces, while the ADR scopes a stale core to blocking AUTHORING (reads keep working on old verbs; the engine's served eligibility is the blocking authority). RESOLVED in `a4ea7beb50`: the reader exposes the handshake as an advisory `components` map and never invents a tier degradation; decision recorded in the S10 step record. Re-check PASS.

### repository-identity | high | the cargo repository field pointed at the wrong owner and would have 404'd the installers at first tag

P03 review, escalating the discrepancy the channel research first flagged. dist derives installer download URLs from the workspace `repository` field; releases publish to the repo the workflow runs in (nevenincs, matching origin and the README), so the stale wgergely value would have broken both installer one-liners. RESOLVED in `bfa4356d17` (Cargo.toml) and `c572b1d2c9` (pyproject project URLs), with the owner confirming nevenincs as the release identity.

### binstall-unresolvable | high | the README documented a cargo-binstall path that cannot resolve

P03/P05 review. The bin package is not on crates.io, no binstall metadata or installer exists, and the S11 step record over-claimed delivery. RESOLVED in `bfa4356d17`: README line removed, S11 record corrected to name binstall a deliberate follow-up, not a v1 artifact.

### updater-name-mismatch | medium | the README named the updater after the binary instead of the package

P03/P05 review. dist names the updater after the app package, consistent with its installer asset naming. RESOLVED in `bfa4356d17`: documented as `vaultspec-cli-update`.

### injected-step-shell-nondeterminism | medium | the injected SPA build step could let a failed npm ci slip into a release artifact on Windows runners

P03/P05 review. pwsh checks native exit codes only at script end. RESOLVED in `bfa4356d17`: the hand-authored `release-build-setup.yml` step is now `shell: bash` with `set -euo pipefail`; `release.yml` regenerated through dist so the staleness gate stays clean.

### housekeeping | low | residual releaser artifacts and nits

P04 review passed with nits (applied in `b48d270955`: `--no-sync` on the ci recipe, dead CHANGELOG excludes dropped). The orphaned `.release-please-manifest.json` the P04 sweep missed was removed in `a4ea7beb50`. The stale search-body assertion the full-suite run surfaced (pre-existing, unrelated) was fixed in `b935372762`.

## Recommendations

- Carried follow-ups, none blocking: enable binstall properly (crates.io publish or explicit metadata plus the binstall installer) if that channel is wanted; zero-copy embedded asset serving (the per-request clone is a resource-bounds-ethos cleanup); SHA-pin GitHub Actions repo-wide (the toolchain action rides a mutable ref); decide whether as-of/temporal envelopes should ever carry the component handshake (currently a recorded conscious exclusion); apply for SignPath Foundation signing once the governance artifacts (published signing policy, roles, MFA) exist.
- First release: merge to main, let the verification workflows run green, then tag the workspace version; the tag triggers the dist workflow. Budget a Defender false-positive cycle for a first winget submission.
- Final verdicts: P01 pass, P02 pass after revision, P03/P05 pass after revision, P04 pass. No open critical or high findings; the packaged artifact is verified installable, runnable, and uninstallable.
