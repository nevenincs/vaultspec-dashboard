---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S16'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Add react-markdown, remark-gfm, and frontmatter handling to the frontend dependencies

## Scope

- `frontend/package.json`

## Description

- Add react-markdown and remark-gfm as runtime dependencies (installed alongside shiki in P03.S12); frontmatter is handled by a small focused parser in the FrontmatterHeader rather than a new YAML dependency, since the vault frontmatter shape is fixed and simple.

## Outcome

The markdown stack is present in runtime deps, rag/torch-free.

## Notes

The ADR listed remark-frontmatter as one option; a dedicated parser was chosen instead to render frontmatter as structured chrome without a YAML library, matching the ADR's "structured header component, not raw YAML" intent.
