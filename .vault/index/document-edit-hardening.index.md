---
generated: true
tags:
  - '#index'
  - '#document-edit-hardening'
date: '2026-06-18'
modified: '2026-06-18'
related:
  - '[[2026-06-18-document-edit-hardening-W01-P01-S01]]'
  - '[[2026-06-18-document-edit-hardening-W01-P01-S02]]'
  - '[[2026-06-18-document-edit-hardening-W01-P01-S03]]'
  - '[[2026-06-18-document-edit-hardening-W02-P02-S04]]'
  - '[[2026-06-18-document-edit-hardening-W02-P02-S05]]'
  - '[[2026-06-18-document-edit-hardening-W02-P02-S06]]'
  - '[[2026-06-18-document-edit-hardening-W03-P04-S10]]'
  - '[[2026-06-18-document-edit-hardening-adr]]'
  - '[[2026-06-18-document-edit-hardening-plan]]'
  - '[[2026-06-18-document-edit-hardening-research]]'
---

# `document-edit-hardening` feature index

Auto-generated index of all documents tagged with `#document-edit-hardening`.

## Documents

### adr

- `2026-06-18-document-edit-hardening-adr` - `document-edit-hardening` adr: `document edit hardening + bidirectional state coupling` | (**status:** `accepted`)

### exec

- `2026-06-18-document-edit-hardening-W01-P01-S01` - Resolve the brokered core invocation to the project-pinned environment instead of an arbitrary PATH binary
- `2026-06-18-document-edit-hardening-W01-P01-S02` - Verify the resolved core advertises the required write verbs at the write boundary and degrade the write tier with an honest advisory on a capability miss
- `2026-06-18-document-edit-hardening-W01-P01-S03` - Live-verify a brokered set-body write succeeds against the pinned core and a missing-verb core degrades with a tiered advisory not an exit-2 passthrough
- `2026-06-18-document-edit-hardening-W02-P02-S04` - File a gh issue and bootstrap a worktree in the vaultspec-core repo for a conformant vault document-rename verb
- `2026-06-18-document-edit-hardening-W02-P02-S05` - Author vault rename: validate target stem, atomic rename, rewrite incoming related references, refresh modified, run checks and refuse on ERROR, emit json envelope with old and new path id and blob, accept expected-blob-hash and dry-run
- `2026-06-18-document-edit-hardening-W02-P02-S06` - Land the rename verb via PR with green CI, release the wheel, and bump the dashboard core pin
- `2026-06-18-document-edit-hardening-W03-P04-S10` - Extend post-write invalidation so the open editor content view re-reads after backend re-ingest

### plan

- `2026-06-18-document-edit-hardening-plan` - `document-edit-hardening` plan

### research

- `2026-06-18-document-edit-hardening-research` - `document-edit-hardening` research: `document edit hardening + bidirectional state`
