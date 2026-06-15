---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S08'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---




# Add conformance tests for the schema route shape, the typed-error envelope, and the JSON value codec roundtrip

## Scope

- `engine/tests/tests/conformance.rs`

## Description

- Added conformance assertions: the schema-route shape, the typed-error envelope (unknown_key / invalid_value / scope_not_allowed), and a scoped-key roundtrip.
- Updated the existing settings conformance test to use registry-declared keys now that writes are validated.

## Outcome

The wire contract is pinned against the live serve.

## Notes

