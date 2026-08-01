---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:ff4dc05dcce20c69eacf9b44447fc69a528b95ee25e558c9992cf6291de96c1a'
step_id: 'S37'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Grep the codebase for any production call to the engine operation mode setting endpoint outside this acceptance test, confirm none exists, and record the finding as a durable comment marking this test the sole sanctioned caller

## Scope

- `src/vaultspec_a2a/service_tests/test_pw7_acceptance.py`

## Description

- Grepped the whole repository for `/v1/mode`, `set_operation_mode`, and `_set_mode(` calls: exactly two call sites exist, both test-only — `AcceptanceHarness._set_mode` in this file, and `test_s20_solo_coder_bridge_live.py`'s reuse of that same harness method (it imports `AcceptanceHarness` rather than re-deriving the call). No `api/`, `control/`, `graph/`, or `providers/` code calls the endpoint.
- Recorded the finding as a durable comment on `AcceptanceHarness._set_mode`'s docstring, naming both call sites and stating this method is the sole sanctioned caller.
- Changed no behaviour — verify-and-report only, per D7 and the ADR's own instruction not to decide what it left open.

## Outcome

Confirms D7's preserved property (the operator alone sets the engine operation mode) is actually true in the current codebase, not merely asserted.

## Notes

None.
