---
tags:
  - '#exec'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S15'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
---

# Live-verify the served code corpus over a real socket serve: module rollup, scoped file descent, and per-corpus filters

## Scope

- `engine/crates/vaultspec-api`

## Description

Boot the new binary (scratch target dir; the canonical dev engine untouched) over a git-initialized polyglot fixture on explicit port 8798 and curl the corpus surface.

## Outcome

Rollup, dir-scoped file descent (imports+contains), /filters?corpus=code vocabulary, and vault-default isolation (no code nodes, no corpus field) all verified over the real socket; scratch engine terminated after.

## Notes
