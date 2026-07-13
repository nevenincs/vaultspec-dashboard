---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S10'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Wire bare invocation (no subcommand) and an explicit open verb to the launcher flow while every existing verb stays byte-identical, including --json envelopes and exit codes, with CLI tests over both doors

## Scope

- `engine/crates/vaultspec-cli/src/main.rs`

## Description

- Make the clap subcommand optional: bare `vaultspec` resolves to the new `Open` verb; add `Open` beside the existing verbs.
- Machine verbs short-circuit before scope resolution; every existing verb's dispatch, envelope shape, and exit codes are untouched.

## Outcome

Bare invocation and `vaultspec open` are the app front door; existing CLI surface byte-identical.

## Notes

Existing CLI envelope regression coverage rides the untouched render() path plus the full crate suite.
