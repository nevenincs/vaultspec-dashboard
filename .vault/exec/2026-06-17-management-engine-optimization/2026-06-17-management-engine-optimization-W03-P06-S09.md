---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
body_hash: 'sha256:6b2fccac74f13a517a6801f19693317dea9cd23888208051f503b53a43f10a3a'
step_id: 'S09'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Shorten graph commit critical section

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Add a dedicated graph commit mutex to serialize commit ordering.
- Move document diff, feature-delta projection, and JSON serialization out of the
  resume-ring lock.
- Reserve live sequence numbers with one atomic range and append/broadcast under the
  ring lock only after payloads are ready.

## Outcome

Graph commits are still serialized and sequence-ordered, but graph-scale projection work
no longer holds the resume ring mutex. `since=` readers and ring append contention now
see a shorter critical section.

## Notes

Verification:

- `cargo test -p vaultspec-api`
