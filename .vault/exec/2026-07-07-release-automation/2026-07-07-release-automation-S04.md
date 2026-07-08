---
tags:
  - '#exec'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S04'
related:
  - "[[2026-07-07-release-automation-plan]]"
---

# restore the block-manual-changelog pre-commit guard now that a generated CHANGELOG.md returns

## Scope

- `.pre-commit-config.yaml`

## Description

- Restore the `block-manual-changelog` pre-commit stanza removed in dashboard-packaging P04.S17, recovered verbatim from that commit and re-pathed to `engine/CHANGELOG.md` (release-please writes the changelog inside the package path)

## Outcome

`prek validate-config` reports all configs valid. The guard is meaningful again: a generated changelog now genuinely returns.

## Notes

- None.
