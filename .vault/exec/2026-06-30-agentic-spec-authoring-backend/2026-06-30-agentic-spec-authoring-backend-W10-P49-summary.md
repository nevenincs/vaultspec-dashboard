---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
related:
  - '[[2026-06-30-agentic-spec-authoring-backend-plan]]'
---

# `agentic-spec-authoring-backend` `W10.P49` summary

W10.P49 completed the transition-state unified write path for editor saves and
closed Increment 2 demo verification.

- Modified: `engine/crates/vaultspec-api/src/authoring/direct_write.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/response.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/store/mod.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/apply.rs`
- Modified: `frontend/src/stores/server/authoring.ts`
- Modified: `frontend/src/stores/server/authoring.test.ts`
- Modified: `.vault/audit/2026-07-06-agentic-spec-authoring-backend-audit.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W10-P49-S221.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W10-P49-S222.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W10-P49-S223.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W10-P49-S224.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W10-P49-S225.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W10-P49-summary.md`

## Description

W10.P49 grounded, implemented, tested, reviewed, and verified the
direct-changeset editor-save transition path. The backend now has a
capability-file gate for the direct path, a direct-write route that composes a
single-child changeset, a legal human self-approval carve-out, automated-writer
denials, replayable direct-write records, conflict-value parity, and dual-run
evidence against the legacy core broker.

The phase review found five direct-write blockers around capability gating,
idempotency, route coverage, replay payload integrity, and post-preflight
conflict shape. Those findings were fixed and re-reviewed. S225 then added the
Increment 2 data-contract proof: autonomous body edit, system approval,
canonical apply, after-the-fact lane, rollback generation, and downgrade requeue.
That proof exposed a real apply/core fence mismatch, now fixed by passing the
full-file blob hash to the internal core invocation while preserving body hashes
in authoring receipts and post-state verification.

Frontend store coverage was extended so `/authoring/status` direct-write
capability fields are consumed as a typed backend-served status contract rather
than inferred or left backend-only.

Verification passed across the focused backend authoring modules, frontend
authoring store/render tests, Rust format/check, frontend typecheck, and
whitespace diff checks. Existing temporary-workspace watcher and declared-tier
warnings still appear in some backend test output after assertions pass.
