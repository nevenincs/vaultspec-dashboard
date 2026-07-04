---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S17'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# fix or remove the dormant CHANGELOG guard hook that assumes release-please runs

## Scope

- `.pre-commit-config.yaml`

## Description

- Remove the `block-manual-changelog` hook stanza: release-please is retired (P04.S16) and no `CHANGELOG.md` exists in the repo, so the hook's guard condition can never fire and its remediation prose ("release-please will regenerate CHANGELOG.md") is now false.
- Confirm no other hook or config references the removed hook id.
- Validate the resulting config still parses with `prek validate-config`.

## Outcome

Hook stanza removed. Grep confirmed `block-manual-changelog` had no other referrers. `uv run --no-sync prek validate-config .pre-commit-config.yaml` reports `success: All configs are valid`. The `exclude: ^CHANGELOG\.md$` clauses on the `mdformat-check` and `pymarkdown` hooks were left untouched (out of scope for this step; they match nothing while the file is absent and cause no harm).

## Notes

No incidents.
