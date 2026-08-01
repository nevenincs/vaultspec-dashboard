---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:ffac73ea4cc49f0b51f2318289433bf59763f724f8302359a9996359f91e16e3'
step_id: 'S36'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add a test proving the respond endpoint accepts an optional notes field and that it survives into the verdict resume payload

## Scope

- `src/vaultspec_a2a/api/tests/test_endpoints.py`

## Description

- Added `test_respond_notes_field_survives_into_verdict_resume_payload` to `TestPermissionRespond`: seeds a `plan_approval`-type pending permission, posts `{"option_id": "approve", "notes": "Looks solid, ship it."}` to the respond route, and asserts the captured worker dispatch's resume payload is exactly `{"verdict": "approved", "notes": "Looks solid, ship it."}`.
- Updated two pre-existing tests in this file that asserted the retired `{"approved": True}` shape to the new `{"verdict": "approved", "notes": None}` shape (necessary for the suite to stay green after the D6 cutover; not itemized as its own Step, since it is a consequence of S32's full-cutover behaviour change).

## Outcome

`TestPermissionRespond`: 11/11 passing (10 pre-existing + 1 new).

## Notes

None.
