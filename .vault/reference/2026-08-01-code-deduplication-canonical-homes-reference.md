---
tags:
  - '#reference'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:716abb888958ee0aacbe2ba3f7064a037b1404ce0aa3f3a1495aa3132761a9cc'
related:
  - "[[2026-08-01-code-deduplication-rag-campaign-audit]]"
---
# `code-deduplication` reference: `Canonical remediation homes`

## Summary

This reference records the source-owned consolidation seams established by the campaign audit.

- `bounded_child::run_bounded` is the API serve-path owner for process spawn, concurrent stream draining, caps, timeout, kill, and reap. Provisioning keeps argv construction and outcome mapping. `engine/crates/vaultspec-api/src/bounded_child.rs:24-198` `engine/crates/vaultspec-api/src/routes/provision.rs:427`.
- The frontend stores layer owns machine-bearer fetch and error-envelope conversion. A direct `httpTransport` module will replace the four duplicated transports and converters while retaining each client's injectable fetch and endpoint-specific policy. `frontend/src/stores/server/engine/client.ts:143-222` `frontend/src/stores/server/agent/a2aTeam.ts:410-454`.
- `useFocusZone` owns Class-B roving focus; `docTypeVocabulary` owns the six displayable localized document types and fail-closed recognition. `frontend/src/app/chrome/useFocusZone.ts:42-198` `frontend/src/stores/server/docTypeVocabulary.ts:49-119`.
- `ingest-struct` is the structural ownership layer for typed document metadata and normalized vault corpus membership; graph and authoring apply their own projections and caps over those results. `engine/crates/ingest-struct/src/reader.rs:1-94` `engine/crates/engine-graph/src/index/mod.rs:1183-1455`.
- `engine_query::envelope::paginate` already owns stable keyset slicing. Authoring retains discovery, sorting, clamp, truncation, and projection while importing the paginator directly. `engine/crates/engine-query/src/envelope.rs:101-149` `engine/crates/vaultspec-api/src/authoring/documents.rs:122-165`.

No compatibility facade, barrel re-export, forwarding helper, new service, or new port is part of the accepted ownership model. Consumers import the source-owning module directly.
