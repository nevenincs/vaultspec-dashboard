---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
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
