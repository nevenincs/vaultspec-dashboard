---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S105'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify approval decisions are governed by backend policy rather than frontend inference

## Scope

- `engine/crates/vaultspec-api/src/authoring/policy.rs`

## Description

- Verify policy decisions are computed in `policy.rs`.
- Verify proposal projections serve the policy decision from backend state.
- Verify HTTP list and detail routes serialize the backend policy block.
- Verify the frontend store preserves served policy and does not synthesize sparse
  policy.
- Verify the review card renders only a served policy label and reason.

## Outcome

S105 is complete. Approval policy is now backend-owned through the served review
path:

- `policy.rs` computes operation mode, risk class, approval requirement, stale
  condition classification, reviewer eligibility, system-auto-approval
  eligibility, and tool permission requirements.
- `projections.rs` calls the policy module when building proposal projections and
  serves `PolicyDecisionProjection` with policy version, scope mode, session
  override, effective mode, risk, requirement, and reason.
- The HTTP proposal list and detail routes serialize that same backend projection
  through the shared envelope.
- The frontend store consumes the served `policy` block and preserves missing
  policy as missing; it does not invent manual/destructive/human-required
  fallbacks.
- The review card renders a policy label and reason only when the backend served
  policy.

This verifies W10.P21's required boundary: approval decisions and policy reasons
are backend policy data, not frontend inference. The remaining accepted low note
is deferred to later approval-decision wiring: human-required policy must be
combined with actor-kind eligibility when this policy layer becomes the decision
authority.

## Notes

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::policy -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml proposal_routes_serve_backend_policy_decision -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
- `npm run typecheck`

The Rust HTTP test target still prints existing temporary watcher warnings after
the test result; all selected tests passed. No destructive git operation was
used.
