---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Add shiki/core, the JS regex engine, and the lang/theme packages to the frontend dependencies (runtime, never rag/torch)

## Scope

- `frontend/package.json`

## Description

- Add shiki, the langs package, and the themes package as runtime dependencies; the fine-grained core and the JavaScript regex engine are subpath exports of shiki, so no separate engine package is needed.
- Add react-markdown and remark-gfm (P04.S16) in the same install.
- Confirm published-wheel-purity: the new deps landed in runtime dependencies and neither vaultspec-rag nor torch is present.

## Outcome

The viewer runtime deps are present, rag/torch-free. The high-severity audit findings are all pre-existing retired gallery/esbuild dev-tooling issues, unrelated to these additions.

## Notes

None.
