---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S47'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the shared json envelope following the core result vocabulary across all verbs

## Scope

- `engine/crates/vaultspec-cli/src/envelope.rs`

## Description

- Implement the shared JSON envelope: core's result vocabulary ({ok, command, status, data | error+message}) plus the contract section 2 per-tier degradation block on every success; failures render typed messages and exit 1; scope-resolution failures exit 2.

## Outcome

Agents fluent in the siblings parse the engine for free (D6.2); rag degradation reasons ride every envelope truthfully.

## Notes

Human (non-json) mode pretty-prints the same payload - the verbs are agent-facing first per engine-spec section 6; bespoke human rendering can layer later without touching the data path.
