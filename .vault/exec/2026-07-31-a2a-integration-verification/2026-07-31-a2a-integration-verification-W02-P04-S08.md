---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:4cf87701d78fe2f3f2dc681213e6deb5db29df2792e5d4e204c86931e2239dba'
step_id: 'S08'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---

# Author the real two-process dashboard and A2A harness

## Scope

- `frontend/e2e/agent/harness.ts`

## Description

Own a scratch engine worktree and A2A home, bind both sides through their fresh
production discovery records, verify engine-origin attachment, and stop only
the exact A2A and engine child trees before removing each owned root.

## Outcome

Dashboard revision `bf71960458` proved real engine-to-A2A attachment over fresh
records. Follow-up revision `12d5096599` independently cleans both owned roots,
guards partial allocation, and permits retry after any cleanup failure. Manual
review matched the prior Sol finding and found the remediation complete.

## Notes

The original full real attach smoke passed. The post-fix smoke reached A2A
scratch-environment provisioning but exceeded the harness's 60-second readiness
bound; it is not counted as a green rerun. That failure path left zero harness
fixture roots and zero A2A-home roots. Prettier and diff checks passed; a
standalone TypeScript compiler is unavailable in this dependency-free worktree.
The requested Sol-medium follow-up review could not be allocated because the
runtime retained completed agents against its thread quota; this record does not
claim that unavailable review occurred.
