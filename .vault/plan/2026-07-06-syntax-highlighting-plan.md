---
tags:
  - '#plan'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
tier: L1
related:
  - '[[2026-07-06-syntax-highlighting-adr]]'
  - '[[2026-07-06-syntax-highlighting-research]]'
  - '[[2026-06-16-review-rail-viewers-adr]]'
  - '[[2026-06-18-editor-dock-workspace-plan]]'
---

# `syntax-highlighting` plan

- [x] `S01` - Extract reusable highlighted code rendering; `frontend/src/app/viewer/HighlightedCode.tsx`.
- [x] `S02` - Mount highlighting in the document editor; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `S03` - Highlight review snippet diffs; `frontend/src/app/authoring/DiffPanel.tsx`.
- [x] `S04` - Cover highlighter editor and snippet behavior; `frontend/src/app/viewer/HighlightedCode.test.tsx`.

## Description

Extend the existing shared Shiki syntax-highlighting stack from read-only
viewers into the editable Markdown document body and bounded review snippets.
The plan keeps code files read-only, preserves the current textarea and editor
store as the write authority, and changes only app-chrome presentation plus
focused tests. It is L1 because the engine, stores wire contracts, and language
registry already exist.

## Steps

## Parallelization

`S01` is first because it provides the reusable renderer. `S02` and `S03` both
depend on that renderer and can be implemented independently once it exists.
`S04` is last because it covers the final editor and snippet behavior.

## Verification

The plan is complete when the Markdown edit surface shows tokenized Markdown
through the shared highlighter while preserving textarea editing, authoring
review diff snippets use the same token-line renderer without losing add/remove
identity, the existing code viewer still renders highlighted lines, focused
Vitest coverage passes, `vaultspec-core vault plan check` passes for this plan,
and the frontend lint gate is run for the touched TypeScript and TSX files.
