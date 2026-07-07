---
tags:
  - '#adr'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
related:
  - "[[2026-07-04-dashboard-packaging-adr]]"
  - "[[2026-07-04-dashboard-packaging-research]]"
---

# `release-automation` adr: `release-please release PR in front of the dist tag pipeline` | (**status:** `proposed`)

## Problem Statement

The dashboard-packaging ADR delivered a working release pipeline: pushing a version tag fires the dist-generated `release.yml`, which builds all five targets with the SPA embedded and publishes archives, checksums, and installers to GitHub Releases. What it left manual is the act of producing that tag, and the ritual is four error-prone human steps: bump `engine/Cargo.toml` `workspace.package.version`, commit, create a tag that exactly matches the new version (dist fails the plan job on a mismatch), push the tag. The realistic failure mode is a forgotten bump or a tag/version mismatch, and the changelog is nobody's job at all. This record decides how tag production, version arithmetic, and the changelog are automated without touching the artifact engine.

## Considerations

- The repo already writes rigorous conventional commits (`feat`/`fix`/`chore` with scopes), so commit-derived semver is free discipline, not new process.
- dist is deliberately dumb about versions: it reads the workspace version and requires the tag to match, but never bumps anything. Something upstream must own the bump.
- The dashboard-packaging ADR D7 retired a release-please config that was orphaned (nothing invoked it) and mistyped (`python`, for the retired wheel). The retirement of that artifact was correct and stands; the accompanying posture - dist owns the whole flow, changelog from conventional commits, no releaser in front - is what this record supersedes. The packaging ADR itself remains accepted; only that D7 posture is amended by this ADR.
- The verification workflows (`engine-ci.yml`, `quality-gates.yml`) run on every PR; a release PR that bumps `engine/Cargo.toml` touches `engine/**`, so both gates fire on it before it can merge.
- The maintainer already knows release-please's model from sibling projects; familiarity is worth weight in a single-maintainer repo.

## Considered options

- **release-please (googleapis/release-please-action), re-typed `rust`, package path `engine`, manifest-driven - CHOSEN.** Maintains a standing release PR that accumulates the changelog and computes the semver bump from conventional commits (pre-1.0 rules: `feat` -> minor, `fix` -> patch); merging it bumps `engine/Cargo.toml`, writes `CHANGELOG.md`, and mints the matching v-tag. Battle-tested, language-agnostic, known to the maintainer.
- **Keep the manual bump+commit+tag+push ritual - rejected.** Zero infrastructure, but four human steps per release, tag/version mismatch as the standing failure mode, and no changelog. This is the cumbersomeness being removed.
- **release-plz - rejected as primary, RETAINED as the named fallback.** Rust-native, cargo-workspace-native, git-cliff changelogs; arguably the better technical fit for a pure-cargo repo and it works without crates.io publishing. Rejected in favor of the tool the maintainer already operates; becomes the designated fallback if release-please's `rust` type fights the `engine/`-subdir workspace layout.
- **dist-owned versioning - not actually an option.** dist has no version-bump verb; it consumes the workspace version and validates the tag against it. Something must still produce the bump and the tag, so "let dist own it all" collapses back into the manual ritual.
- **Tag-protection / `dispatch-releases` variants - rejected.** dist's workflow-dispatch mode or protected-tag rules harden who may tag but automate nothing; they can be layered later if tagging rights ever need tightening.

## Constraints

- **The `engine/` subdirectory workspace is the frontier risk.** release-please's `rust` release type must bump a cargo workspace whose root is `engine/`, not the repo root. The config points the package path at `engine`; this must be validated at implementation time before trusting the first release PR, with release-plz as the fallback if the layout fights.
- **`Cargo.lock` must move with the version.** Whether the `rust` type updates the lockfile alongside `Cargo.toml` must be verified; if not, an `extra-files` entry or a small post-bump step is required, or the release PR ships a stale lock and the verification build diverges.
- **The GITHUB_TOKEN tag footgun is the key implementation hazard.** Tags created with the default `GITHUB_TOKEN` do not trigger downstream `on: push: tags` workflows - the classic release-please integration trap, which would silently produce tags that never fire `release.yml`. The action must run with a PAT (or a GitHub App token), or the release flow must chain explicitly.
- The version single-source remains `engine/Cargo.toml` `workspace.package.version`; release-please writes it, nothing else does.
- The tag format release-please mints must keep matching dist's trigger pattern (`**[0-9]+.[0-9]+.[0-9]+*`); default v-prefixed tags do.
- The `block-manual-changelog` pre-commit guard removed in P04 is restored: with a generated `CHANGELOG.md` in-tree, hand edits become drift again.

## Implementation

High-level layering only. A `release-please.yml` workflow runs the action on pushes to main with a properly-scoped token; config (`release-please-config.json`, typed `rust`, package path `engine`) and manifest return to the repo root. The action maintains the release PR; merging it commits the version bump plus `CHANGELOG.md` and creates the tag; the tag fires the existing dist `release.yml` exactly as a manual tag would - dist config, targets, installers, and artifact set are untouched. The pre-commit CHANGELOG guard stanza is restored. The dashboard-packaging ADR's D7 row gains a supersession note pointing here. Release ritual becomes: merge feature PRs -> merge the release PR when ready to ship.

## Rationale

The artifact pipeline was never the cumbersome part; tag production was. Automating it with a release PR removes all four human steps and their mismatch failure mode, makes the changelog a build product, and strengthens rather than weakens the gating property the packaging ADR established: the release PR itself must pass the verification workflows before it can merge, so tags are minted only from verified main. Keeping dist unchanged preserves the reviewed, locally-verified artifact path; the two tools meet at exactly one seam - the tag - which is why the composition is safe. Choosing release-please over release-plz trades a slightly better technical fit for operational familiarity in a single-maintainer project, with the fallback named rather than implied. Reintroducing release-please does not reverse D7: what P04 deleted was an orphaned, mistyped artifact of the retired wheel; what returns is a correctly-typed, actually-invoked releaser layered in front of the flow D7 built.

## Consequences

- Releasing becomes one merge click on the release PR; version arithmetic and the changelog stop being human jobs.
- Conventional-commit discipline becomes load-bearing for versioning - a mislabeled commit now mis-sizes a version bump. The discipline already exists culturally; it now has teeth.
- One more workflow, config, and manifest to maintain, plus a token with tag-push rights to provision and rotate - the PAT/App-token requirement is operational surface that did not exist before.
- The pre-commit CHANGELOG guard returns; `CHANGELOG.md` is generated, never hand-edited.
- The first release PR must be watched end to end (subdir workspace bump, lockfile, tag firing `release.yml`) before the flow is trusted; if the `rust` type fights the layout, the recorded fallback is release-plz, not a bespoke script.
- A future tightening path (protected tags, dispatch-releases) stays open and orthogonal.
