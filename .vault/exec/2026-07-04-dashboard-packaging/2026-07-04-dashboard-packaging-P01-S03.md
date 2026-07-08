---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S03'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# implement the embedded asset store and the embedded-first resolution chain (embedded, then VAULTSPEC_SPA_DIR, then frontend/dist, then placeholder) preserving the traversal guard, MIME map, deep-link fallback, API prefix boundary, and token injection

## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs`

## Description

- Add the feature-gated `EmbeddedSpa` rust-embed store over `frontend/dist` (path relative to the crate manifest, `debug-embed` so test builds embed too)
- Introduce the source-blind `SpaSource` enum (Embedded or Disk) answering the handler's two questions (contains, read) so the serving logic is identical across sources
- Add `resolve_spa_source` implementing the embedded-first chain: compiled-in store when the feature baked assets in, else `VAULTSPEC_SPA_DIR`, else the workspace `frontend/dist`, else the placeholder; dev builds (no feature) skip straight to the disk passthrough
- Rework `spa_fallback` to serve through `SpaSource`, preserving verbatim the traversal guard, the MIME map, the deep-link `index.html` fallback, the `API_PREFIXES` JSON-404 boundary, and the bearer-token meta injection

## Outcome

Verified end to end. `cargo test -p vaultspec-api --lib` passes 374 tests both without and with `--features embed-spa`; `rustfmt --check` clean on the touched file; clippy clean on the touched file (remaining crate warnings belong to unrelated in-flight authoring work). A release binary built with the feature (25 MB) was run from a clean scratch directory holding only a git-initialised fixture vault, with no `frontend/dist` reachable and `VAULTSPEC_SPA_DIR` unset: `/` served the real embedded `index.html` with the `vaultspec-token` meta injected (placeholder unreachable), a hashed JS asset served as `text/javascript`, a deep link fell back to the SPA shell as `text/html`, and an API path returned bearer-gated JSON carrying the honest `tiers` envelope.

## Notes

- The initial resumption found this step's work uncommitted after the prior executor session was cut off; the diff was reviewed line by line, one rustfmt nit fixed, and the work verified before commit.
- The full workspace `cargo fmt --check` and clippy carry pre-existing findings confined to `engine/crates/vaultspec-api/src/authoring/` uncommitted work belonging to the in-flight agentic-spec-authoring-backend plan; deliberately left untouched.
- A supervised dev `vaultspec.exe` kept respawning and locking the debug binary; the verification used the release profile, which the packaged artifact uses anyway.
