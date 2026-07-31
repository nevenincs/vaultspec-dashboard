---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
body_hash: 'sha256:64d191cafc6ee0bf83660dbebfc91ab83cae839d26bfd418ed3d094471a2e5ea'
step_id: 'S11'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Serve the code facet vocabulary on /filters behind the corpus parameter

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

Serve the code vocabulary (languages, module dirs) on /filters?corpus=code; vault default unchanged.

## Outcome

Vocabulary rides the shared envelope with tiers.

## Notes
