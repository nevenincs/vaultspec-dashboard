---
tags:
  - '#research'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:05d5540307453e5c1ad2200f699b5724bfe7820d3043ba5a7f8145a19687b6ce'
related:
  - "[[2026-08-01-code-deduplication-rag-campaign-audit]]"
  - "[[2026-08-01-code-deduplication-canonical-homes-reference]]"
---
# `code-deduplication` research: `Campaign remediation evidence`

The campaign found ten production duplications with concrete canonical owners. The evidence favors direct consolidation within existing layers over wrappers: it preserves each consumer's domain policy while deleting repeated mechanics and the observed behavioural drift.

## Findings

### Existing owners make direct consolidation lower risk than new abstractions

The campaign audit and canonical-home reference identify owned primitives for bounded children, keyset pagination, focus navigation, document vocabulary, and structural reading. Introducing adapters or compatibility exports would preserve a second ownership surface instead of retiring it. `engine/crates/vaultspec-api/src/bounded_child.rs:24-198` `engine/crates/engine-query/src/envelope.rs:101-149` `frontend/src/app/chrome/useFocusZone.ts:42-198`.

### Structural metadata and corpus membership require separate contracts

Status/tier parsing establishes typed document meaning, while vault enumeration establishes normalized worktree or committed-tree membership and I/O behaviour. Both belong in `ingest-struct`, but combining them would couple independent failure and test surfaces. The ADR must decide separate direct APIs in the same owning layer. `engine/crates/engine-graph/src/index/mod.rs:1183-1455` `engine/crates/engine-graph/src/asof.rs:156-177` `engine/crates/vaultspec-api/src/authoring/documents.rs:436-584`.

### Frontend consolidation must retain client-specific policy

The four store clients share bearer injection and non-success response conversion, while actor-token layering, success adaptation, business refusal handling, and retry policy remain client-specific. The vault-tree and code-file walks likewise share generation-aware draining but retain different progressive and truncation policy. The ADR must settle source-owned utilities rather than a new omnibus client. `frontend/src/stores/server/engine/client.ts:143-426` `frontend/src/stores/server/authoring/index.ts:181-262` `frontend/src/stores/server/agent/index.ts:97-159` `frontend/src/stores/server/agent/a2aTeam.ts:410-454`.

### Focus and document vocabulary already have governing contracts

The keyboard-navigation and terminology decisions require one focus primitive and one document-type vocabulary. The campaign evidence shows current copies have diverged, so remediation should migrate consumers directly and delete their local maps and movement machinery. `frontend/src/app/kit/Segment.tsx:42-96` `frontend/src/app/left/CreateDocDialog.tsx:338-785` `frontend/src/app/menu/ContextMenuHost.tsx:190-407` `frontend/src/app/viewer/docTrail.ts:12-39`.

### Alternatives rejected by the evidence

Keeping local wrappers or aliases was rejected because it leaves duplicate ownership and violates the user's direct-import constraint. Moving all client or graph policy into one mega-module was rejected because it erases intentional protocol and projection boundaries. Treating focus movement as a one-shot broad rewrite was rejected because the three composites need serial migration with real interaction proof.

## Sources

`2026-08-01-code-deduplication-rag-campaign-audit`
`2026-08-01-code-deduplication-canonical-homes-reference`
`engine/crates/vaultspec-api/src/bounded_child.rs:24-198`
`engine/crates/engine-query/src/envelope.rs:101-149`
`engine/crates/ingest-struct/src/reader.rs:1-94`
`frontend/src/stores/server/engine/client.ts:143-426`
`frontend/src/app/chrome/useFocusZone.ts:42-198`
`frontend/src/stores/server/docTypeVocabulary.ts:49-119`
