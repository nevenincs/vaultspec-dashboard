---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# `user-state-persistence` `W03.P06` summary

Wave `W03` summary (Phases `W03.P06` endpoints, `W03.P07` conformance + e2e tests; Steps
S19-S24). Added the top-level session and settings API surface that the frontend calls.

- Created: `engine/crates/vaultspec-api/src/routes/session.rs`.
- Modified: `engine/crates/vaultspec-api/src/lib.rs`, `src/routes/mod.rs`, `src/routes/spa.rs`,
  `src/registry.rs`, `engine/tests/tests/conformance.rs`, `engine/tests/tests/e2e.rs`.

## Description

`GET/PUT /session` and `GET/PUT /settings` land through the shared envelope helper so every
response, success and the unknown-scope 400, carries the per-tier `tiers` block. The session
shape is `{ workspace, active_scope, scope_context: { folder, feature_tags }, recents }`;
settings is `{ global, scoped }` with empty scopes sparse-omitted. A `PUT /session`
active-scope change validates and warms the target through the registry before mutating, then
persists through `UserState`; the `user_state` mutex guard is never held across an await. The
routes are registered in the router and bearer-gated via the SPA prefixes.

Verification: conformance tests prove tiers on every response and PUT-then-GET roundtrip plus
the tiered 400; the e2e test proves a scope switch retargets reads to the sibling worktree and
resumes its own per-scope clock. Gate green; inference crates untouched. Code review verdict
PASS; one LOW (an empty-string `scope_context.scope` colliding with the active-scope pointer
row) was guarded as a follow-up before the frontend wave built atop the shape.
