---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:e3e475fb47e0ba61bf6e5bdbce6432f1c4349325e7ef2ff17c6a67467b3b918a'
step_id: 'S06'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---

# Configure the deterministic scenario substrate as the permanent completion floor

## Scope

- `src/vaultspec_a2a/providers/`

## Description

Separate the in-process deterministic ProviderFactory lane from the externally
tape-backed mock lane, so only deterministic can satisfy completion and mock
remains optional supplemental coverage.

## Outcome

A2A revision `9fc02555` declares deterministic as the singleton completion
floor and locks the distinction through production-factory provider tests.
Focused provider tests passed `48`; Ruff format/lint passed; Sol-medium review
approved. File-scoped strict typing remains red only at pre-existing unchanged
model-profile JSON and private-test-import diagnostics.

## Notes

The real acceptance proof is separately recorded in S05/S31. This review did
not run it without its required live service record and durable bundle root.
