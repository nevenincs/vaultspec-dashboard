---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S14'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Record live core JSON payloads as fixtures and add parser and runner tests against them

## Scope

- `engine/crates/ingest-core/tests/`

## Description

- Record live core JSON payloads as fixtures: vault graph v2, vault list, vault stats, vault feature list - captured from vaultspec-core 0.1.28 against this repository's own vault (26 docs, 54 declared edges, 203 derived edges).
- Add integration tests driving the full pinned-envelope-to-parsed-graph path against every fixture, including edge-id uniqueness and reparse determinism.

## Outcome

The adapter is tested against real envelopes, not hand-written approximations; five fixture tests green.

## Notes

Fixtures contain absolute paths from this machine (core emits them); the parser deliberately reads stems, not paths, so the tests are machine-portable.
