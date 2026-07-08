---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S16'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# remove the orphaned python-typed release-please configuration in favor of the dist tag-driven flow

## Scope

- `release-please-config.json`

## Description

- `git rm release-please-config.json` - nothing else invoked it (no workflow step, no manifest, no `CHANGELOG.md`); the packaging ADR designates `dist`'s tag-driven flow as the sole releaser going forward.

## Outcome

File removed. Confirmed via grep that only the packaging vault documents and the `.pre-commit-config.yaml` `block-manual-changelog` hook (retired separately in P04.S17) referenced it; no CI workflow, manifest, or code path depended on it.

## Notes

No incidents.
