---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S224'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run Unified write path: direct-changeset dual-run for the editor save code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Run two W10.P49 review agents over the direct-write domain and route/API/store
  integration.
- Record five W10.P49 findings in `2026-07-06-agentic-spec-authoring-backend-audit.md`:
  three high findings for missing capability gating, missing conflict replay,
  and payload-underbound replay; two medium findings for route coverage and
  post-preflight conflict shape.
- Resolve the high findings before closing the review gate: add backend-owned
  direct-write capability state, gate the route before execution, serve truthful
  capability flags, store a direct-write request digest, and persist conflict and
  agent-denial value outcomes for replay.
- Add route/status regression coverage through `authoring_router`,
  `ResolvedCommand`, actor-token middleware, wrong command kind, tiered envelope,
  disabled capability, enabled capability, and enabled agent-denial value paths.
- Run two follow-up review agents scoped to the W10.P49 fixes; both found no
  remaining medium-or-higher issue.

## Outcome

`S224` is complete. The W10.P49 review gate found real blockers and they were
resolved in the same step before closure. Direct editor saves are now disabled by
default unless backend capability state enables the direct-changeset authority,
and `/authoring/status` reports the same backend-owned state. Direct-write
idempotency now binds replay to the request digest, conflict outcomes are
replayable terminal values, agent direct-save denials are replayable terminal
values, and stale/base drift has a direct conflict value path.

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::direct_write -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http::tests::direct_write -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http::tests::authoring_status_reports_enabled_direct_write_capability_through_router -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::response -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::api -- --nocapture`
- `cargo fmt -p vaultspec-api --check`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `git diff --check -- ...` over the W10.P49 touched backend files

## Notes

The `vaultspec-rag` MCP endpoint still returned `Transport closed`, so discovery
used the `uvx vaultspec-rag search` CLI path. One local CLI search returned stale
direct-write snippets even though exact file reads showed the current code; exact
source reads and test output were treated as authoritative for closure evidence.

The focused route/status tests emit existing temporary-workspace watcher and
declared-tier warnings from the app fixture. The assertions passed; no tests were
skipped or xfailed.
