---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S04'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# add feature-gated tests covering embedded index delivery, asset MIME, deep-link fallback, API 404 boundary, and token injection

## Scope

- `engine/crates/vaultspec-api`

## Description

- Add the `embedded_spa` feature-gated test module inside the existing router test harness (`fixture_state` + `build_router` + oneshot requests), with a raw-body helper alongside the JSON one
- Cover: embedded `/` serves the real index with the `vaultspec-token` bootstrap and the placeholder unreachable; a hashed JS chunk discovered via the embedded store's iterator serves as `text/javascript`; a deep link falls back to the embedded shell with the bootstrap; an unknown API path stays a JSON 404 carrying the `tiers` block, never the shell
- Gate the pre-existing placeholder test to builds without the feature, since an embedded bundle makes the placeholder unreachable by design and the test name must stay truthful
- Widen `EmbeddedSpa` to crate visibility so the test can enumerate real bundle assets instead of hardcoding a hashed filename

## Outcome

`cargo test -p vaultspec-api --lib --features embed-spa` passes 377 tests (the four new embedded tests green); without the feature 374 pass with the placeholder test back in force. `rustfmt --check` clean on both touched files; clippy reports nothing on them. Grounded via rag semantic search to the spa route epicenter and the existing oneshot harness before authoring.

## Notes

- Tests exercise the real embedded bundle (the `debug-embed` feature bakes assets into test builds), so a built `frontend/dist` is a test-time prerequisite for the feature-on run; CI must order the frontend build first, which the release workflow step P03.S12 encodes.
