---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S52'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement SPA static serving with embedded assets, fallback routing to index html, correct MIME types and dev-mode filesystem passthrough

## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs`

## Description

- Implement SPA serving: filesystem dist-dir resolution (env override, then frontend/dist), correct MIME types from an extension map, fallback routing of unknown non-API paths to index.html, path-traversal guard, and an honest placeholder page when no bundle exists.

## Outcome

Contract R2 serving requirements met; same-origin eliminates CORS.

## Notes

Asset EMBEDDING (rust-embed) is deliberately deferred to the D9.2 bundling mechanics - the contract records embed-vs-dist as implementation detail, and the dev passthrough is the shape both modes share. Flagged for review.
