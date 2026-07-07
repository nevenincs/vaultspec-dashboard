---
tags:
  - '#exec'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S07'
related:
  - "[[2026-07-07-release-automation-plan]]"
---

# validate the config pair against the published release-please JSON schemas and pass the repo lint gates

## Scope

- `release-please-config.json`

## Description

- Validate `release-please-config.json` and `.release-please-manifest.json` against the schemas published in the release-please repo (ajv draft-07 with the formats plugin; the CLI wrapper chokes on the `uri-reference` format, so validation ran through the ajv API directly)
- Run the repo gates over every touched file class: prek config validation, markdown lint, vault check

## Outcome

Both documents valid; all gates exit 0.

## Notes

- Remote behavior (the release PR itself, the tag chaining) is only observable on GitHub; it is the documented first-release watch list, not a locally verifiable property.
