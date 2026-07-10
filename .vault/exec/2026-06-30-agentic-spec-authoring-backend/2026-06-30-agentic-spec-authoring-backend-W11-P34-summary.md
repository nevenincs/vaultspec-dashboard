---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W11.P34` summary

W11.P34 is complete. The phase grounded, implemented, tested, reviewed, and
verified the authoring lifecycle stream and recovery surface over the durable
transactional outbox, while keeping generation/token replay deferred to W12.P44.

- Created: `engine/crates/vaultspec-api/src/authoring/stream.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/mod.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/response.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/store/unit_of_work.rs`
- Modified: `.vault/audit/2026-07-06-agentic-spec-authoring-backend-audit.md`
- Created: `2026-06-30-agentic-spec-authoring-backend-W11-P34-S166.md`
- Created: `2026-06-30-agentic-spec-authoring-backend-W11-P34-S167.md`
- Created: `2026-06-30-agentic-spec-authoring-backend-W11-P34-S168.md`
- Created: `2026-06-30-agentic-spec-authoring-backend-W11-P34-S169.md`
- Created: `2026-06-30-agentic-spec-authoring-backend-W11-P34-S170.md`

## Description

S166 resolved the W11/W12 scope overlap: W11.P34 owns lifecycle SSE replay,
last-sequence gaps, and snapshot-plus-next-sequence recovery; full
generation/token channel runtime and transcript compaction remain in W12.P44.

S167 added the stream module, mounted `/authoring/v1/events` and
`/authoring/v1/recovery`, replayed lifecycle records from the durable outbox,
served recovery through the shared tiered authoring envelope, and exposed
non-authoritative generation placeholder metadata.

S168 added real-behavior Rust tests over the actual SQLite authoring store and
outbox. The tests cover `last_seq` replay, restart recovery, too-old cursor
gaps, negative cursor gaps, tiered recovery snapshots, mounted recovery routes,
and the W12-deferred generation placeholder contract. This step also introduced
a read-command transaction helper so recovery can use existing repository code
without opening a mutating command boundary.

S169 ran the formal code review with two reviewer agents. Three findings were
resolved before closure: cursors ahead of the durable high-water now produce an
explicit gap, SSE setup error frames now carry `tiers`, and `/v1/events` uses
`SubscribeEvents` while `/v1/recovery` uses `RecoverEventStream`. The read
transaction helper was hardened with SQLite `query_only`.

S170 verified the client recovery contract: lifecycle truth recovers through
durable outbox replay or snapshot-plus-next-sequence recovery, cursor failures
are explicit, and generation/token gaps remain non-authoritative.

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::stream -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store::unit_of_work -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::response -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http::tests::authoring_router_serves_the_list_read_through_the_middleware -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml --check`
- `git diff --check` on the W11.P34 touched implementation, audit, and exec files.
