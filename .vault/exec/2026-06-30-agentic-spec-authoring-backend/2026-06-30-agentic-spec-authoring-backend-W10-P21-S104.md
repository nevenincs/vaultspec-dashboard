---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S104'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Approval policy matrix code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Run formal W10.P21 policy review with two read-only reviewer agents.
- Scaffold and fill the W10.P21 audit with the high, medium, and low findings.
- Resolve the high backend-served policy projection finding.
- Resolve the medium tool-permission human-gate finding.
- Resolve the follow-up sparse-frontend-policy inference finding.
- Run follow-up reviewer agents and record the cleared findings in the audit.
- Run focused backend, frontend, and authoring-wide verification.

## Outcome

S104 is complete. The initial review found:

- High: the policy decision projection existed but was not served by proposal
  projections, leaving S105 impossible.
- Medium: mutating and dangerous tool permission requests were represented as a
  denied action instead of a human-gated request.
- Low: the raw reviewer helper permits distinct agent reviewers, so later
  approval-decision wiring must combine policy requirement with actor-kind
  eligibility.

The high finding is resolved: proposal projections now serve the backend-computed
policy decision, list and detail routes serialize it through the existing
projection path, and the frontend store/card consume the served mode,
requirement, and reason. The medium finding is resolved: human-gated tool
permission requests are requestable and carry the human-approval reason rather
than being refused outright. A follow-up reviewer caught that the frontend sparse
adapter initially synthesized a policy fallback; that is also resolved by
preserving absent policy as absent and rendering no policy label unless the
backend served one.

Follow-up review found no remaining high or medium blockers. The remaining low
reviewer-role note is accepted for later approval-decision wiring.

## Notes

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::policy -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
- `npm run typecheck`

The authoring-wide Rust test target passed with existing temporary watcher/core
graph warnings printed after the test result. No destructive git operation was
used.
