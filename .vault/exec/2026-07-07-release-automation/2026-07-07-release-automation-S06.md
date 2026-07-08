---
tags:
  - '#exec'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S06'
related:
  - "[[2026-07-07-release-automation-plan]]"
---

# reword the maintainers release process to the merge-the-release-PR ritual and name the first-release watch list

## Scope

- `README.md`

## Description

- Reword the maintainers' release section: one merge click on the standing release PR; version arithmetic and changelog are build products; `engine/CHANGELOG.md` never hand-edited
- Name the first-release watch list: the engine version bump + lockfile consistency, and the minted tag actually firing `release.yml` via the `RELEASE_PLEASE_TOKEN` secret

## Outcome

Markdown gate passes on the README.

## Notes

- None.
