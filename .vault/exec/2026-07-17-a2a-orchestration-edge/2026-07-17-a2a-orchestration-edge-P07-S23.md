---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-20'
step_id: 'S23'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Run a cross-repository adversarial code review and close the rolling audit

## Scope

- `.vault/audit/`
- `.vault/exec/`
- Dashboard A2A broker, relay, frontend query, and recovery surfaces
- Sibling gateway, discovery, database, and credential boundaries

## Description

- Run independent performance/memory, contract/test, and pragmatic-security reviews against the implemented code.
- Classify every finding by severity and type, implement every critical/high defect, and re-review each remediation.
- Preserve the original audit snapshot and append dated dispositions with exact residual queue items.
- Verify production credential separation, Windows ACL behavior, cross-dialect SQL, fully active large-store performance, terminal-aware reconnect, and dense streamed reconciliation.

## Outcome

All three adversarial lanes returned pass with no remaining critical or high finding. The final performance lane found no remaining defect after cached byte charges and scoped structural-sharing removal. The conformance lane independently passed the production credential non-interchangeability matrix. The safety lane confirmed the PostgreSQL, reservation/retry, secret-free handoff, Windows/Unix permission, credential-separation, run-id, and redaction fixes.

Focused evidence includes 42 Rust A2A route tests, 54 frontend stream/reducer/team/provider tests, 35 sibling API/reservation/lifecycle/dialect/100,000-active-row tests, six Rust product discovery checks, TypeScript, Ruff, and formatting. The A2A-targeted files remain within the module-size limit; the repository-wide scanner now reports a concurrently changed 2,939-line product `manifest.rs`, which is queued to that workstream. The audit also keeps one medium cross-repository lost-ack end-to-end proof gap and one low existing Vitest `shell: true` warning queued; none is a demonstrated A2A production implementation defect.

## Notes

The audit cycle is closed for this implementation pass, not frozen permanently. Later integration infrastructure should boot the production dashboard broker, sibling gateway, and worker together and deliberately lose the start acknowledgement to retire the remaining proof gap.

## 2026-07-20 follow-up execution

The retained proof gap is now closed by a real cross-repository service test.
Its relay cuts the first commit response while the upstream commit is still in
flight, then the production dashboard retries the identical request. The test
proves one durable A2A run, one active dashboard lease, one accepted worker
dispatch, exact-replay success, altered-replay refusal, and a successful real
authoring session mutation with the minted role token.

The first follow-up review returned revision-required rather than pass. Six high
findings were fixed: prepare now hard-gates execution readiness; prepare-returned
role actors are registered active; commit is single-flight and request-digest
bound; the dashboard validates the full committed response and stable run id;
the authenticated run-start surface supports idempotent reservation release;
and reserved lease hashes are inert with bounded expiry and retention
maintenance. Frontend setup, authoring-engine startup, POSIX process-group
cleanup, and worker-log memory bounds were also closed.

Green evidence is the 1/1 production cross-repository proof, 2/2 real armed
gateway admission tests, 2/2 mounted frontend HTTP tests, TypeScript typecheck,
Ruff lint/format, and a current production dashboard CLI build. The focused Rust
route suite passed 17/17 before the final five-case strict-response coverage was
added; its final test-profile rerun is presently blocked outside this scope by
the concurrent Windows-authority compile error recorded in the rolling audit.

The queue retains only cross-repository CI coordination and decomposition of the
four concurrently changed product modules that still fail the repository-wide
1,500-line gate. Both remain medium and external to the A2A implementation.
