---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b06f40e13ca234fefc8855fc71ece58207f222669e7c4fdbfeaa0539c6abd1c2'
step_id: 'S07'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Established `ingest-struct` as the sole typed structural metadata owner. ADR status and plan tier carry explicit canonical or legacy provenance. Live and historical graph indexing parse once per document and reuse that result: filter facets project canonical values only, while lifecycle intentionally accepts labeled legacy ADR status values. The four graph-local scanners were deleted without aliases or re-exports.

## Outcome

- VaultSpec RAG semantic discovery succeeded against the resident available and consistent index.
- Typed parser tests passed: 3 tests.
- Focused engine graph canonical-facet, legacy-lifecycle, and real temp-vault projection tests passed; the full engine-graph unit suite passed: 44 tests.
- `cargo fmt --check` and `cargo check` passed for ingest-struct and engine-graph.
- Scoped diff check passed; output contained only known CRLF normalization warnings.
- Independent Sol review approved.

## Notes

Evidence and scope limits are recorded above.
