---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:f6017c97d2edaf90b234ac14b1c80a9bb83add46289739b78d427a20d52e30ab'
step_id: 'S03'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---

# Add a regression test resolving every bundled preset worker model through the REAL provider factory with no protocol injection and asserting a chat-model instance each time, demonstrated red against a deliberately injected non-model resolution since the original defect can no longer supply the red

## Scope

- `src/vaultspec_a2a/graph/tests/test_compiler.py`

## Description

- Add a production-factory regression lock for every bundled preset worker.
- Resolve 34 workers across 14 presets through `ProviderFactory` and assert each result is a `BaseChatModel`.
- Demonstrate the lock red with a temporary factory fault returning `object`, then restore the factory before commit.
- Run focused tests, Ruff, formatting, Ty, and an independent code review.

## Outcome

Committed A2A revision `7c52f62b` adds the lock without protocol injection or a test double. The focused regression run passed for all 14 presets; the temporary fault failed at the expected type assertion and was not committed. The A2A review reported no findings.

## Notes

The isolated worktree lacks ignored ACP runtime assets. Validation supplied those assets only through the existing main worktree's project root while importing the isolated source; no local path or environment workaround entered committed code.
