---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:cf4733210bdb280a69f5597f11b1601b9cde577652f381510b54435c57fcbb43'
step_id: 'S25'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Migrated the vault-tree complete listing walk to direct private generation drain use. Its nested attempts, pages, generation baseline, and restart loop were deleted. Vault-tree retains cumulative progress, incomplete partial publication, paced yielding, and settlement through callbacks. Code-file listing is unchanged for S26.

## Outcome

- VaultSpec RAG semantic discovery succeeded against the resident available and consistent index.
- Focused helper and client tests passed: 13 tests.
- A deterministic four-request generation straddle regression proves mixed-prefix data is discarded and the restarted generation wins.
- Prettier and scoped diff hygiene passed.
- Independent Sol review approved.
- Broad frontend typecheck remains blocked by an unrelated shared unused `menu` local in ContextMenuHost interactive tests.

## Notes

Evidence and scope limits are recorded above.
