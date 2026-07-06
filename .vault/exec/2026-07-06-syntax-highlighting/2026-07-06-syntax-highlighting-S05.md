---
tags:
  - '#exec'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S05'
related:
  - "[[2026-07-06-syntax-highlighting-plan]]"
---

# Broaden language coverage

## Scope

- `frontend/src/app/viewer/languages.ts`
- `frontend/src/app/viewer/MarkdownReader.tsx`
- `frontend/src/app/viewer/CodeViewer.tsx`
- `frontend/src/stores/server/engine.ts`
- `frontend/src/stores/server/queries.ts`
- `engine/crates/vaultspec-api/src/routes/content.rs`
- `frontend/src/app/viewer/useHighlighter.test.ts`

## Description

- Replace the small frontend grammar table with Shiki's bundled language registry while preserving lazy grammar imports.
- Add path-derived hints for common source, config, build, lockfile, and component file names and extensions.
- Use the shared language display-name helper for Markdown code-fence labels and code-viewer badges.
- Update the backend content route so code-viewer responses emit the same practical hint vocabulary for served files.

## Outcome

- Markdown fenced blocks, the highlighted Markdown editor, code viewers, and review snippets now accept Shiki's broad bundled language vocabulary through one resolver.
- No CodeMirror or Monaco dependency was added, and the native textarea remains the document edit authority.
- No new frontend fetch path was added; the code viewer still consumes the store-projected content response.

## Verification

- `npm --prefix frontend run test -- src/app/viewer/useHighlighter.test.ts src/app/viewer/MarkdownReader.test.tsx src/app/viewer/CodeViewer.test.tsx src/app/viewer/HighlightedCode.test.tsx src/app/authoring/DiffPanel.render.test.tsx`
- `npm --prefix frontend run format:check`
- `npm --prefix frontend run typecheck`
- `cargo test -p vaultspec-api language_hint_covers_the_required_set`
- `cargo fmt --manifest-path Cargo.toml --all --check` from `engine/`
- `just dev lint frontend`
