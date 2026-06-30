---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S02'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

# Unit-test that the machine-global pointer is the first candidate and an absent pointer is skipped

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Added `the_storage_parent_machine_pointer_is_the_first_candidate` (the pointer is index 0, ahead of the STATUS_DIR-default file) and `an_absent_machine_pointer_is_skipped_for_a_present_status_file` (a real `discover_at` over an absent pointer + a present fresh status file discovers via the present one).

## Outcome

3 candidate tests pass (the 2 new + the existing precedence test); the additive, tolerant behavior is regression-guarded; clippy/fmt clean.

## Notes

No mocks; the skip test writes a real temp status file with a fresh heartbeat.
