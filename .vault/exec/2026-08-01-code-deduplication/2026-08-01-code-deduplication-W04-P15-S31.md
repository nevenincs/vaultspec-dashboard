---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b5ef72db3faf875f653a2999b03a19d5ffdf0b8790c2035597efedfe6c631101'
step_id: 'S31'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Removed the Create Document dialog's local document-type presentation maps. The dialog imports `docTypePresentation` and `DOCUMENT_TYPE_MESSAGES` directly from the canonical stores-owned vocabulary. One private lookup provides the generic document fallback for served unknown values; creation eligibility and purpose hints remain dialog policy.

## Outcome

- VaultSpec RAG semantic search returned the canonical focus and document-type ownership context.
- `npm exec vitest run src/app/left/CreateDocDialog.render.test.tsx` passed: 23 tests.
- Prettier check and scoped `git diff --check` passed.
- Exact residue search found no retired local document-type maps or duplicate lookup helper.
- Independent Sol review approved after one correction that collapsed initially duplicated private helpers.

## Notes

A rerun of `npm run typecheck` reports an existing concurrent error in `src/app/kit/StateBlock.tsx:80` involving `LucideIcon | null` as JSX. The prior typecheck for this scope passed; S31 only removes local map definitions and redirects two label reads, so this unrelated error is not attributed to this remediation.
