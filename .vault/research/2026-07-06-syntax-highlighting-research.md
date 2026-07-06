---
tags:
  - '#research'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
related:
  - "[[2026-06-16-review-rail-viewers-adr]]"
  - "[[2026-06-18-editor-dock-workspace-plan]]"
---

# `syntax-highlighting` research: `syntax highlighting across editors and review snippets`

This research grounds the current syntax-highlighting state before extending it to
the already-shipped editing and review-snippet surfaces. It uses the accepted
viewer ADR and completed editor-dock plan as the governing intent, then confirms
the live implementation with semantic search, targeted grep, and git history.

## Findings

### F1 - The viewer stack already has the required Shiki core

The accepted viewer ADR selected one shared Shiki highlighter for Markdown fences
and code viewers. The implementation exists in `frontend/src/app/viewer/useHighlighter.ts`:
one lazy singleton, per-language dynamic grammar loading, a bounded tokenization
cache, HAST output for Markdown fences, and per-line token arrays for the code
viewer. `frontend/src/app/viewer/highlighterTheme.ts` binds token colors to
`var(--color-*)`, preserving the OKLCH theme tier across light, dark, and
high-contrast modes.

### F2 - The supported language set is already centralized

`frontend/src/app/viewer/languages.ts` covers the ADR-required set: Rust, Python,
JavaScript, TypeScript, JSX, TSX, Bash, batch, PowerShell, C, C++, JSON, TOML,
YAML, Markdown, plus CSS and HTML. Aliases cover common fence spellings such as
`ts`, `tsx`, `sh`, `ps1`, `c++`, `yml`, and `md`. Unknown hints intentionally
degrade to plain text rather than guessing.

### F3 - Viewer surfaces are highlighted, edit mode is not

`frontend/src/app/viewer/CodeViewer.tsx` already uses `useTokenLines` to render a
line-numbered, virtualized, read-only code file view. `frontend/src/app/viewer/MarkdownReader.tsx`
uses `useHighlightedHast` for fenced code blocks. The document edit surface in
`frontend/src/app/viewer/MarkdownDocView.tsx` is still a plain `<textarea>` bound
to `editor.draftText`, so raw Markdown bodies lose syntax highlighting exactly
where authors edit code fences and vault document structure.

### F4 - Review snippets render raw diff text

The authoring review station was added in recent history by commits
`460dd0793d` and `4d332ef462`. Its `frontend/src/app/authoring/DiffPanel.tsx`
computes bounded text diffs client-side and renders added, removed, and context
lines as raw text. The backend serves bounded base and proposed document texts, so
syntax highlighting here is a presentation concern and can reuse the same shared
highlighter without adding a wire field.

### F5 - The smallest safe extension is reusable rendering, not a new editor engine

The project has Shiki and no CodeMirror or Monaco dependency. Adding a full editor
engine would reopen bundle, theming, focus, and write-state questions that prior
ADRs deliberately avoided: code files remain read-only, and Markdown documents
edit raw text. The least risky path is to extract reusable token-line rendering
from `CodeViewer`, mount an overlay-highlighted Markdown editor that preserves the
native textarea as the input authority, and reuse the same renderer for bounded
review snippets.
