---
generated: true
tags:
  - '#index'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
related:
  - '[[2026-06-26-rag-service-management-W01-P01-S01]]'
  - '[[2026-06-26-rag-service-management-W01-P01-S02]]'
  - '[[2026-06-26-rag-service-management-W01-P01-S03]]'
  - '[[2026-06-26-rag-service-management-W01-P02-S04]]'
  - '[[2026-06-26-rag-service-management-W01-P02-S05]]'
  - '[[2026-06-26-rag-service-management-W01-P02-S06]]'
  - '[[2026-06-26-rag-service-management-W01-P03-S07]]'
  - '[[2026-06-26-rag-service-management-W01-P03-S08]]'
  - '[[2026-06-26-rag-service-management-W02-P04-S09]]'
  - '[[2026-06-26-rag-service-management-W02-P04-S10]]'
  - '[[2026-06-26-rag-service-management-W02-P05-S11]]'
  - '[[2026-06-26-rag-service-management-W02-P06-S12]]'
  - '[[2026-06-26-rag-service-management-W03-P07-S13]]'
  - '[[2026-06-26-rag-service-management-W04-P08-S14]]'
  - '[[2026-06-26-rag-service-management-W04-P09-S15]]'
  - '[[2026-06-26-rag-service-management-W04-P09-S16]]'
  - '[[2026-06-26-rag-service-management-W05-P10-S17]]'
  - '[[2026-06-26-rag-service-management-W05-P11-S18]]'
  - '[[2026-06-26-rag-service-management-W05-P11-S19]]'
  - '[[2026-06-26-rag-service-management-W05-P11-S20]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-26-rag-service-management-audit]]'
  - '[[2026-06-26-rag-service-management-plan]]'
  - '[[2026-06-26-rag-service-management-reference]]'
  - '[[2026-06-26-rag-service-management-research]]'
---

# `rag-service-management` feature index

Auto-generated index of all documents tagged with `#rag-service-management`.

## Documents

### adr

- `2026-06-26-rag-service-management-adr` - `rag-service-management` adr: `rag operations console over a single-machine multi-tenant service` | (**status:** `accepted`)

### audit

- `2026-06-26-rag-service-management-audit` - `rag-service-management` audit: `review and live verification against rag 0.2.25`

### exec

- `2026-06-26-rag-service-management-W01-P01-S01` - Add an ungated GET /health liveness confirm and a Running/Crashed/Absent discovery state with reason to rag-client discovery
- `2026-06-26-rag-service-management-W01-P01-S02` - Distinguish crashed from absent on the wire status and per-tier degradation block
- `2026-06-26-rag-service-management-W01-P01-S03` - Surface running, crashed, and absent rag state through the stores adapters
- `2026-06-26-rag-service-management-W01-P02-S04` - Stop mapping an already-running server start to 502 in the lifecycle runner and attach on exit-1 or exit-0
- `2026-06-26-rag-service-management-W01-P02-S05` - Gate server-start on the predicate returning genuinely-absent and map machine-owned to attach-and-succeed
- `2026-06-26-rag-service-management-W01-P02-S06` - Make the stores start action conditional and carry attach semantics
- `2026-06-26-rag-service-management-W01-P03-S07` - Extend the rag verb whitelist to forward bounded validated server-start flags and chain needs-install to qdrant install
- `2026-06-26-rag-service-management-W01-P03-S08` - Enforce machine-global discovery precedence with no STATUS_DIR override and add a guard test
- `2026-06-26-rag-service-management-W02-P04-S09` - Add a bounded memoized rag-ops aggregation projection over the Tier-1 rag HTTP surface
- `2026-06-26-rag-service-management-W02-P04-S10` - Serve the rag-ops state through a new engine route via the shared envelope and tiers block
- `2026-06-26-rag-service-management-W02-P05-S11` - Add capability-and-version-gated Qdrant collection-info reads using names from storage survey, degrading honestly
- `2026-06-26-rag-service-management-W02-P06-S12` - Add bounded stores query hooks and types for the rag-ops state surface
- `2026-06-26-rag-service-management-W03-P07-S13` - Design the machine-level rag operations console frames in the binding Figma file and surface them for owner review
- `2026-06-26-rag-service-management-W04-P08-S14` - Author machine-level lifecycle ActionDescriptors and render the host-level control with stop-is-machine-wide copy
- `2026-06-26-rag-service-management-W04-P09-S15` - Render the per-tenant data-management section as ActionDescriptors driving reindex, clean rebuild, evict, and watcher
- `2026-06-26-rag-service-management-W04-P09-S16` - Render the diagnostics section for size, jobs, storage survey, orphans, and quality, and mount the console into the chrome
- `2026-06-26-rag-service-management-W05-P10-S17` - Gate the embeddings direct-Qdrant scroll behind a health capability and Qdrant-version check, degrading the embedding tier honestly
- `2026-06-26-rag-service-management-W05-P11-S18` - File the rag coordination asks for HTTP prune and optimize routes, a contract_version on health, and the server-start idempotency envelope
- `2026-06-26-rag-service-management-W05-P11-S19` - Codify the machine-singleton, codified-contract, and no-STATUS_DIR-override rules and write the mutually-referenced invariant
- `2026-06-26-rag-service-management-W05-P11-S20` - Run the full code review of the campaign and resolve required revisions

### plan

- `2026-06-26-rag-service-management-plan` - `rag-service-management` plan

### reference

- `2026-06-26-rag-service-management-reference` - `rag-service-management` reference: `shared rag service contract and coordination asks`

### research

- `2026-06-26-rag-service-management-research` - `rag-service-management` research: `rag single-machine multi-tenant service alignment`
