---
tags:
  - '#adr'
  - '#syntax-highlighting'
date: '2026-07-06'
modified: '2026-07-06'
related:
  - "[[2026-07-06-syntax-highlighting-research]]"
  - "[[2026-06-16-review-rail-viewers-adr]]"
  - "[[2026-06-18-editor-dock-workspace-plan]]"
---

# `syntax-highlighting` adr: `shared Shiki highlighting for editor and snippets` | (**status:** `accepted`)

## Problem Statement

The dashboard already has a shared Shiki highlighter for Markdown fences and the
read-only code viewer, but the document edit mode and authoring review diff
snippets still render raw text. That creates a split experience: users can read
highlighted code snippets in view mode, then lose syntax highlighting when editing
the same Markdown body or reviewing generated document changes. This ADR records
how syntax highlighting is extended across the implemented editor, snippet, and
viewer surfaces without adding a second highlighter or a new editor engine.

## Considerations

- The accepted viewer ADR already chose Shiki as the single syntax-highlighting
  authority and bound it to the OKLCH token tier.
- The completed editor-dock plan explicitly keeps code files read-only and mounts
  a raw Markdown body editor for editable vault documents.
- The code viewer and Markdown reader already consume `useHighlighter.ts`; edit
  mode and review snippets are presentation gaps, not new wire or engine needs.
- The implementation must keep the textarea as the editable authority so browser
  editing, selection, form semantics, spellcheck control, and global key dispatch
  behavior do not change.
- Review diff snippets are bounded upstream and computed client-side, so
  highlighting them must remain app-chrome presentation over served text.

## Considered options

- **Reuse the existing Shiki singleton with shared token-line rendering.** Chosen:
  it preserves the one-highlighter rule, reuses the existing language registry and
  theme, and adds the smallest amount of frontend code.
- **Adopt CodeMirror or Monaco for document edit mode.** Rejected: it would add a
  second editor/highlighting stack, reopen focus/keymap/theming contracts, and
  imply code editing affordances the editor-dock plan explicitly excluded.
- **Leave edit mode plain and only improve snippets.** Rejected: the user goal is
  a syntax-highlighting capable editor, and Markdown body editing is the surface
  where code snippets are authored.
- **Server-side highlighted HTML.** Rejected: highlighting is already a frontend
  token-theme projection, and serving HTML would add escaping and theme-coupling
  risks to the engine.

## Constraints

- The highlighter cache remains bounded at creation.
- App chrome remains dumb: no new fetches, no raw `tiers` reads, and no engine
  contract changes.
- The editor must preserve the existing save, conflict, rename, advisory, and
  unsaved-edit guard flows.
- The overlay must not create layout shifts or text overlap; highlighted text and
  textarea text must share the same font, line height, padding, wrapping, and
  scroll position.
- Parent features are stable enough: the viewer highlighter has real Shiki tests,
  and the editor-dock plan is complete with code read-only and Markdown edit mode
  already mounted.

## Implementation

Extract a reusable highlighted line renderer from the code viewer into a viewer
module that consumes `useTokenLines`. The code viewer keeps its virtualized
line-numbered shell and delegates token rendering to the shared module. Markdown
edit mode mounts a highlighted textarea: a non-interactive highlighted layer under
a transparent native textarea, synchronized for scroll, wrapping, and line
height. Review diff snippets use the same line renderer for each bounded diff
line while preserving the existing add/remove/context gutter and diff color
identity.

## Rationale

This extends the already-accepted one-highlighter architecture instead of adding
a second syntax stack. It keeps editable state in the existing textarea and
editor store while making the visible code and Markdown tokens come from the same
Shiki grammar registry used by readers and viewers. The result matches the user
goal with minimal bundle, contract, and data-safety risk.

## Consequences

- The document editor, Markdown fenced-code reader, code viewer, and authoring
  review snippets share language support and token colors.
- Code files remain read-only; this ADR does not authorize a source-code editing
  workflow.
- The editor overlay has a real maintenance cost: future typography or padding
  changes must keep the textarea and highlighted layer in lock-step.
- Review snippets gain language-aware readability without changing the authoring
  wire projection.
