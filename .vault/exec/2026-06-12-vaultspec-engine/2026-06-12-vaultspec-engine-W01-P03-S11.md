---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S11'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the core subprocess runner for vault graph JSON with pinned schema versions and loud failure on unknown schema

## Scope

- `engine/crates/ingest-core/src/runner.rs`

## Description

- Implement `CoreRunner`: spawn `vaultspec-core <verb> --json` inside the scope's checkout (scope stays per-request), preferring the PATH binary and falling back to the uv-managed invocation.
- Implement the versioned `Envelope` with `parse_pinned`: unknown schema versions raise a typed error naming both the found schema and the supported set - loud failure, never a guess (ADR D5.1).
- Test pinning accept/reject and malformed-JSON paths.

## Outcome

The process boundary to core is one auditable seam: every consumed verb passes schema pinning before any field is read.

## Notes

Subprocess execution is untested in unit scope by design (environment-dependent); the parse layer carries the contract and S14's fixtures carry the realism.
