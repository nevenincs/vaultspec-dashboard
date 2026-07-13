---
generated: true
tags:
  - '#index'
  - '#rag-storage-broker'
date: '2026-06-27'
modified: '2026-07-12'
related:
  - '[[2026-06-27-rag-storage-broker-P01-S01]]'
  - '[[2026-06-27-rag-storage-broker-P01-S02]]'
  - '[[2026-06-27-rag-storage-broker-P01-S03]]'
  - '[[2026-06-27-rag-storage-broker-P01-S04]]'
  - '[[2026-06-27-rag-storage-broker-P01-S05]]'
  - '[[2026-06-27-rag-storage-broker-P02-S06]]'
  - '[[2026-06-27-rag-storage-broker-P02-S07]]'
  - '[[2026-06-27-rag-storage-broker-P02-S08]]'
  - '[[2026-06-27-rag-storage-broker-adr]]'
  - '[[2026-06-27-rag-storage-broker-audit]]'
  - '[[2026-06-27-rag-storage-broker-plan]]'
  - '[[2026-06-27-rag-storage-broker-research]]'
---

# `rag-storage-broker` feature index

Auto-generated index of all documents tagged with `#rag-storage-broker`.

## Documents

### adr

- `2026-06-27-rag-storage-broker-adr` - `rag-storage-broker` adr: `broker rag's destructive storage verbs through the bounded CLI runner` | (**status:** `accepted`)

### audit

- `2026-06-27-rag-storage-broker-audit` - `rag-storage-broker` audit: `code review verification`

### exec

- `2026-06-27-rag-storage-broker-P01-S01` - Add the RAG_STORAGE_CLI_WHITELIST mapping storage-delete, storage-prune, and storage-migrate to their fixed rag base args
- `2026-06-27-rag-storage-broker-P01-S02` - Add a validate_namespace_prefix guard rejecting any value that is not rag's canonical r-hash prefix
- `2026-06-27-rag-storage-broker-P01-S03` - Implement storage_args_for assembling the validated argv per verb (prefix for delete, active-cell root and to-backend enum for migrate, the dry-run or yes flag from apply)
- `2026-06-27-rag-storage-broker-P01-S04` - Implement a storage-aware bounded runner that forwards the rag ok-and-command envelope verbatim on a non-zero preview exit and 502s only a genuine fault
- `2026-06-27-rag-storage-broker-P01-S05` - Unit-test the prefix guard, the argv assembly per verb, and the runner envelope-forwarding-on-exit-1 versus 502-on-fault
- `2026-06-27-rag-storage-broker-P02-S06` - Add the ops_rag_storage route validating the body, gating apply to --yes versus the default --dry-run, and running the storage-aware runner
- `2026-06-27-rag-storage-broker-P02-S07` - Register the storage route in the router and the brokered ops namespace
- `2026-06-27-rag-storage-broker-P02-S08` - Add route-level tests asserting an unknown verb 403s, a malformed prefix 400s, the default request previews, and an apply request passes yes

### plan

- `2026-06-27-rag-storage-broker-plan` - `rag-storage-broker` plan

### research

- `2026-06-27-rag-storage-broker-research` - `rag-storage-broker` research: `broker rag destructive storage verbs through the bounded CLI runner`
