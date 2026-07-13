---
tags:
  - '#audit'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
related:
  - "[[2026-07-11-document-editor-redesign-plan]]"
---

# `document-editor-redesign` audit: `post-execution code review`

## Scope

The uncommitted working-tree implementation of the editor redesign (the corpus
selector, the pure formatting and tag helpers, the shared combobox, the Related and
Feature pickers, the Properties popover, the formatting toolbar, and the
`MarkdownDocView` rewrite) reviewed against the accepted ADR, the plan, and the
binding project rules (actions-keymap-palette, frontend-store-selectors,
architecture-boundaries, design-system, filtering). Typecheck, eslint, prettier, and
the px scan were clean at review time; the focus was correctness and rule adherence.

## Findings

### mod-k-swallows-command-palette | critical | The editor's Mod+K accelerator hijacked the global command-palette shortcut while a document was being edited

An early draft handled Mod+B/I/K formatting accelerators on the body textarea's own
`keydown`, calling `preventDefault` + `stopPropagation`. Because those chords are
existing Class-A global bindings (`Mod+K` = command palette, `Mod+B` = left-rail
toggle) fired by the one keymap dispatcher on a window listener that intentionally
still fires inside text fields, the textarea consumed the native event before it
reached the dispatcher. Pressing Mod+K while editing inserted a markdown link instead
of opening the palette — a direct violation of the actions-keymap-palette law (no
surface grows its own global keydown for a command). RESOLVED: the bespoke formatting
accelerators were removed entirely; formatting is now a toolbar-only command surface,
and Save remains the one editor keymap-registry binding.

### missing-markdowndocview-render-test | high | The plan's named MarkdownDocView render test did not exist, so the keydown wiring shipped untested

`P04.S07` committed to `MarkdownDocView.render.test.tsx` but the file was absent; the
component tests exercised the pickers/toolbar in isolation, never the mounted editor's
keydown behavior — which is why the Mod+K collision went unnoticed. RESOLVED: authored
`MarkdownDocView.render.test.tsx` mounting the real editor and asserting the full-width
body, closed-by-default popover, toolbar formatting over a live selection, and — as a
regression guard — that Mod+K / Mod+B are NOT consumed by the editor.

### adr-plan-keymap-enrollment-drift | medium | The ADR/Plan claimed formatting verbs were enrolled in the keymap registry, which the shipped design deliberately does not do

RESOLVED: the ADR (actions consideration + Implementation §1/§2) and the plan
(`P04` intent, `S06` action) were amended to record the toolbar-only, no-formatting-
chord decision and the reasons (selection needs the focused textarea; the chords
collide with Class-A globals).

### feature-field-stale-while-open | low | The Feature combobox could show a stale value if the frontmatter changed under an already-open popover

RESOLVED: the Feature combobox now carries a `key` on the current feature, so it
re-seeds if the value changes externally while the popover is open.

### badge-vs-chip-naming | low | The Related tokens use the kit `Badge` (dot-less pill), not the ADR-named `Chip`

RESOLVED (documentation): the ADR now names `Badge` as the removable-token primitive,
since a link token carries no category dot. Same kit pill family; no rule violation.

## Recommendations

- Live browser verification against the running SPA remains a recommended final visual
  confirmation (not run in this session).
- No further code changes required: all findings are resolved and the full frontend
  lint gate plus the `viewer` suite (14 files, 77 tests) are green.
