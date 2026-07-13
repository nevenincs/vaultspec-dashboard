---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W10.P21` summary

W10.P21 is complete. The approval policy matrix is represented as backend policy
data and is served through the review projection so the frontend consumes, rather
than derives, the policy state.

- Modified: `engine/crates/vaultspec-api/src/authoring/policy.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/projections.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http.rs`
- Modified: `frontend/src/stores/server/authoring.ts`
- Modified: `frontend/src/stores/server/authoring.test.ts`
- Modified: `frontend/src/app/authoring/ReviewStation.tsx`
- Modified: `frontend/src/app/authoring/ReviewStation.render.test.tsx`
- Created: `.vault/audit/2026-07-06-agentic-spec-authoring-backend-audit.md`
- Created: W10.P21 Step Records `S101` through `S105`

## Description

The phase grounded the accepted operation-modes, approval-gates, and
security-provenance decisions into an implementation checklist, then verified and
corrected the existing policy module. The final scope includes named modes
(`manual`, `assisted`, `autonomous`), narrowing-only session override logic,
conservative operation and changeset risk classification, the destructive
human-approval floor, system-auto-approval eligibility as a policy fact only,
approval stale-condition classification, reviewer self-approval reuse, and
separate tool-permission policy.

The phase review found and resolved two blocking issues. First, the policy
decision projection existed but was not served; proposal list and detail
projections now include the backend-computed policy decision, and the frontend
renders the served mode, requirement, and reason. Second, mutating and dangerous
tool permission requests were modeled as denied; they now remain requestable and
carry a human-approval reason. A follow-up review found and resolved one frontend
sparse-adapter issue: missing policy stays absent rather than becoming a
frontend-inferred default.

No W10.P48 behavior was introduced: no mode store, system-actor auto-approval
execution, after-the-fact lane, kill switch, LangGraph wiring, or direct editor
save dual-run landed in this phase.

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::policy -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
- `npm run typecheck`

Known remaining note: the raw self-approval helper permits a distinct agent
reviewer. That is accepted for this policy-data phase; later approval-decision
wiring must enforce human eligibility when the policy requirement is
`human_approval_required`.
