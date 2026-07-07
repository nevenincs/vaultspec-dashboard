---
tags:
  - '#exec'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S03'
related:
  - "[[2026-07-07-release-automation-plan]]"
---

# add the release-please workflow on pushes to main, running the v4 action with a release token seam (PAT or App token) so the minted tag actually fires the downstream release workflow

## Scope

- `.github/workflows/release-please.yml`

## Description

- Add the `release-please` workflow: on pushes to main, `googleapis/release-please-action@v4` with the config/manifest pair and `contents: write` + `pull-requests: write` permissions
- Encode the token seam: `secrets.RELEASE_PLEASE_TOKEN || github.token`, with the header comment stating the hazard plainly - a tag minted by the default token does not trigger downstream workflows, so `release.yml` would silently never fire without the PAT

## Outcome

Workflow YAML parses; the fallback keeps the release-PR flow alive without the secret while the comment and README name the one-time provisioning step.

## Notes

- Provisioning `RELEASE_PLEASE_TOKEN` (fine-grained PAT, contents + pull-requests write) is a user action; it cannot be created from this session.
