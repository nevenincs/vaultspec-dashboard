---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:34856a1ca239cfd54e36044ccd777d7491d3aaa413edbc99be0921f27867eacf'
step_id: 'S09'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Migrated provisioning version probing to a direct canonical `bounded_child::run_bounded` import. Provisioning keeps program and argument construction, zero-exit gating, stdout-first/stderr-fallback selection, and first non-empty version-line parsing. The canonical bounded owner now exclusively performs spawn, stdio setup, concurrent drain, 64 KiB cap, timeout, kill, and reap.

## Outcome

- VaultSpec RAG semantic search succeeded against the resident available and consistent index.
- Real `rustc --version` subprocess regression passed.
- `cargo fmt --check -p vaultspec-api`, targeted `cargo test`, and `cargo check -p vaultspec-api` passed.
- Scoped `git diff --check` passed.
- Independent Sol review approved.

## Notes

Evidence and scope limits are recorded above.
