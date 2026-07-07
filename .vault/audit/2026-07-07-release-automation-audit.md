---
tags:
  - '#audit'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
related:
  - "[[2026-07-07-release-automation-plan]]"
  - "[[2026-07-07-release-automation-adr]]"
---

# `release-automation` audit: `review and revision closure`

## Scope

The mandatory code review of the release-automation implementation (plan S01-S07, commit `9f609f1058`) and the revision round it required (commit `5bcf876663`), re-checked and cleared by the same reviewer. Verification substrate: release-please's own updater and strategy classes driven locally against the real repo manifests, a real stale-lock dist build, schema validation against the published release-please schemas, and the repo lint gates.

## Findings

### rust-strategy-virtual-manifest | high | the rust release type throws on the package-less virtual workspace manifest

The rust strategy unconditionally registers its built-in Cargo.toml updater on the package root; driven against the real `engine/Cargo.toml` it throws "is not a package manifest", and the strategy never expands glob members (`crates/*`), leaving its versions map empty. This was the exact frontier risk the ADR constrained to implementation-time validation. RESOLVED in `5bcf876663`: release-type switched to `simple`, which with `createIfMissing: false` writes no stray version file when none exists; the proven toml jsonpath extra-file owns the workspace version bump; changelog path, tag shape, and the pre-commit guard all verified strategy-independent. Re-check PASS.

### lock-staleness | high | the release PR cannot bump the lockfile, and provably does not need to

The generic toml updater's jsonpath filters do not match lockfile array entries, so per-crate extra-files are impossible. Resolved by experiment rather than code: a real stale-lock dist build (workspace 0.1.1, lock 0.1.0) exited 0 with cargo auto-reconciling all thirteen member versions mid-build, and the reviewer independently confirmed nothing in any workflow or dist config builds `--locked`. The one-release member-version lag is documented in the README as benign, with commit-the-refresh guidance. Re-check PASS.

### release-pr-race | medium | rapid pushes to main could race on the release PR

RESOLVED in `5bcf876663`: a `concurrency` group serializes release-please runs with `cancel-in-progress: false`.

### residual | low | non-blocking nits carried forward

The restored pre-commit guard entry is a valid but fragile folded plain scalar (a block scalar would be sturdier). The first live release PR must be watched end to end per the README first-release list: no version.txt appears in the real action runner, and the minted v-tag fires `release.yml` once the `RELEASE_PLEASE_TOKEN` secret exists. Both fail safe.

## Recommendations

- Provision `RELEASE_PLEASE_TOKEN` (fine-grained PAT, contents + pull-requests write) before expecting a merged release PR to publish artifacts; without it the tag is minted but never chains.
- Watch the first release PR end to end, then trust the flow; the fallback if anything fights in the real runner remains release-plz per the ADR.
- Final verdict: initial WITHHOLD (two high, one medium), revision `5bcf876663`, re-check PASS with non-blocking nits. No open critical or high findings.
