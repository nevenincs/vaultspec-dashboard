---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S12'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# adapt the generated release workflow to build the frontend before the cargo build, enable the embed-spa feature, and gate publishing on the verification jobs

## Scope

- `.github/workflows/release.yml`

## Description

- Adapt the workflow through dist's OWN seams, never by hand-editing the generated file (hand edits break the plan job's `dist generate --check` staleness gate): `features = ["embed-spa"]` in the dist config enables the embed on every build, and `github-build-setup = "release-build-setup.yml"` injects Node 22 setup plus `npm ci` and the frontend production build into every build job BEFORE cargo runs
- Regenerate with `dist generate`; the workflow triggers on version tags, runs plan, matrix builds, global artifacts, host, and GitHub Release publish

## Outcome

The generated `release.yml` shows the injected steps (setup-node then the frontend build) ahead of the dist build step on every target runner, satisfying the D2 build order. `dist plan` and a full local `dist build` succeed against the regenerated config.

## Notes

- Gating model: dist's flow has no seam to `needs:` the separately-triggered verification workflows. Publishing is gated by process instead — releases are cut by tagging a commit on main whose push already ran `engine-ci` and `quality-gates` green, plus `pr-run-mode = "plan"` validating release config on PRs. This is the standard dist posture; encode it in the release documentation (P05.S20).
