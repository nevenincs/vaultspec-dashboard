---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W02.P09` summary

W02.P09 is complete. The Rust authoring store now has a transactional outbox
primitive with durable event rows, monotonic `AUTOINCREMENT` sequence identity,
duplicate append replay, local publication claim state, restart recovery, and
stale/expired claim guards.

- Modified: `engine/crates/vaultspec-api/src/authoring/store/mod.rs`
- Created: `engine/crates/vaultspec-api/src/authoring/store/outbox.rs`
- Modified: `.vault/plan/2026-06-30-agentic-spec-authoring-backend-plan.md`
- Modified: `.vault/audit/2026-06-30-agentic-spec-authoring-backend-audit.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W02-P09-S41.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W02-P09-S42.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W02-P09-S43.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W02-P09-S44.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W02-P09-S45.md`
- Created: `.vault/exec/2026-06-30-agentic-spec-authoring-backend/2026-06-30-agentic-spec-authoring-backend-W02-P09-summary.md`
- Modified: `.vault/index/agentic-spec-authoring-backend.index.md`

## Description

The outbox migration bumps the authoring store to schema version 4 and creates
`authoring_outbox_events`. The table records stable aggregate identity, actor
identity, optional command/idempotency keys, compact JSON payloads with hashes,
publication state, claim leases, publish attempts, and terminal publish
timestamps.

The repository attaches to the existing checked `UnitOfWork` boundary through
`UnitOfWork::outbox()`. `append_event` inserts durable events in the same
transaction as caller product-state changes, replays duplicate `dedupe_key`
appends, and reports structured conflicts for changed payloads. Publication
helpers claim pending or expired rows, recover stale claims, publish only under
the active unexpired claim, and keep published rows terminal.

Verification passed:

- `cargo test -p vaultspec-api authoring::store::outbox -- --nocapture`
- `cargo test -p vaultspec-api authoring::store -- --nocapture`
- `cargo test -p vaultspec-api`
- `cargo clippy -p vaultspec-api --all-targets -- -D warnings`

Code review passed after resolving a medium concurrent dedupe replay finding,
a low high-water coverage gap, and a low lease-expiry ambiguity. The follow-up
review was clean and confirmed no out-of-scope stream route, LangGraph adapter,
publisher thread, frontend projection, token stream, or proposal/session/apply
domain table was added.
