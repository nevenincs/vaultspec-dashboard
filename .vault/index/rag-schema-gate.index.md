---
generated: true
tags:
  - '#index'
  - '#rag-schema-gate'
date: '2026-06-27'
modified: '2026-06-27'
related:
  - '[[2026-06-27-rag-schema-gate-P01-S01]]'
  - '[[2026-06-27-rag-schema-gate-P01-S02]]'
  - '[[2026-06-27-rag-schema-gate-P01-S03]]'
  - '[[2026-06-27-rag-schema-gate-P01-S04]]'
  - '[[2026-06-27-rag-schema-gate-P01-S05]]'
  - '[[2026-06-27-rag-schema-gate-P02-S06]]'
  - '[[2026-06-27-rag-schema-gate-P02-S07]]'
  - '[[2026-06-27-rag-schema-gate-P02-S08]]'
  - '[[2026-06-27-rag-schema-gate-adr]]'
  - '[[2026-06-27-rag-schema-gate-audit]]'
  - '[[2026-06-27-rag-schema-gate-plan]]'
  - '[[2026-06-27-rag-schema-gate-research]]'
---

# `rag-schema-gate` feature index

Auto-generated index of all documents tagged with `#rag-schema-gate`.

## Documents

### adr

- `2026-06-27-rag-schema-gate-adr` - `rag-schema-gate` adr: `gate the direct-Qdrant embedding read on rag's storage-schema contract` | (**status:** `accepted`)

### audit

- `2026-06-27-rag-schema-gate-audit` - `rag-schema-gate` audit: `code review verification`

### exec

- `2026-06-27-rag-schema-gate-P01-S01` - Add the schema_version Option u64 field to HealthInfo and parse it from the /health body
- `2026-06-27-rag-schema-gate-P01-S02` - Pin KNOWN_STORAGE_SCHEMA_VERSION and EXPECTED_DENSE_DIM as the engine's declared-compatibility constants
- `2026-06-27-rag-schema-gate-P01-S03` - Implement a tolerant extractor pulling version, dense vector name, and effective dim from the /readiness descriptor value
- `2026-06-27-rag-schema-gate-P01-S04` - Implement the pure storage_schema_supported gate applying the newer-version, dense-name, and dimension rules with a typed reason
- `2026-06-27-rag-schema-gate-P01-S05` - Unit-test the extractor and the gate across compatible, newer-version, dim-mismatch, missing-dense-name, and malformed-descriptor cases
- `2026-06-27-rag-schema-gate-P02-S06` - Apply the cheap /health schema_version gate after the Qdrant capability gate, degrading on a newer version before the /readiness round-trip
- `2026-06-27-rag-schema-gate-P02-S07` - Read the /readiness descriptor and apply the dense-name and dimension gate before the scroll, degrading through the existing closure
- `2026-06-27-rag-schema-gate-P02-S08` - Add a route-level test asserting a newer schema_version and a dimension mismatch each degrade the embedding tier with the reason stated

### plan

- `2026-06-27-rag-schema-gate-plan` - `rag-schema-gate` plan

### research

- `2026-06-27-rag-schema-gate-research` - `rag-schema-gate` research: `adopt rag storage-schema contract in the direct-Qdrant read gate`
