---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S08'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# document the scoop bucket add and cargo binstall --git install paths, replacing the crates-io-shaped binstall posture

## Scope

- `README.md`

## Description

- Add the scoop bucket-add + install pair and the cargo-binstall git-mode one-liner to the README install section, alongside the existing installers and checksum guidance

## Outcome

Markdown gate passes. The binstall line documents ONLY the --git form (plain binstall resolves via crates.io, which this application deliberately does not serve, per the ADR).

## Notes

- None.
