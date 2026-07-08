---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S06'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# add the scoop-bump post-announce workflow (workflow_call plan input, version extraction, sha256 fetch, manifest rewrite, chore commit to main)

## Scope

- `.github/workflows/scoop-bump.yml`

## Description

- Add the `scoop-bump` workflow: `workflow_call` with the required `plan` input, `contents: write`, checkout of main, tag extraction from the dist plan's `announcement_tag`, hash fetch from the published `.sha256`, jq rewrite of version/url/hash, idempotent no-op when already current, and a `chore(scoop):` commit pushed to main (changelog-hidden for release-please)

## Outcome

Workflow YAML parses; the generated release workflow calls it with the plan JSON after announce.

## Notes

- The bump commit is authored by the github-actions bot; a failed job leaves scoop one release behind, visible in the run, never silent.
