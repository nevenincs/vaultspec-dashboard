---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S20'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Move A2A discovery and health off async workers and make actor-token issuance idempotent, failure-revoked, and retention-bounded

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`
- `engine/crates/vaultspec-api/src/authoring/actor_tokens.rs`

## Description

- Require a validated stable run id before brokered token issuance.
- Offload discovery, health, status preflight, SQLite token lifecycle, and forwarding as one blocking operation.
- Serialize starts through a fixed 64-stripe table and avoid fresh issuance when the sibling already owns the run id.
- Rotate random purpose-keyed credentials in place, reclaim expired or revoked rows, and enforce a 4,096-row hard ceiling.
- Require the sibling to durably reserve `SUBMITTED` before worker dispatch.
- Treat a post-loss `404` as ambiguous and make one exact same-id, same-token, same-payload retry; revoke immediately only on explicit refusal.
- Split the broker tests from production code so every touched module remains below the 1,500-line gate.

## Outcome

The broker no longer blocks Tokio workers before offload and token persistence is bounded across retries and failures without making secrets deterministic or recoverable. Actor-token lifecycle tests passed 8 of 8, `cargo check -p vaultspec-api` passed, and all touched modules satisfy the size gate. The final combined broker test command is recorded in the P07 review evidence.

## Notes

Adversarial integration found that unconditional cleanup after a dropped POST response could revoke authority for a run the sibling had accepted. The sibling now commits its reservation before dispatch. Confirmation and one exact retry occur under the same stripe; a post-loss `404` remains ambiguous, while an explicit HTTP refusal revokes immediately. Retained ambiguity credentials remain bounded and expiring.
