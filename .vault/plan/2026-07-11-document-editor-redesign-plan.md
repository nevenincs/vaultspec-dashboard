---
tags:
  - '#plan'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-11-document-editor-redesign-adr]]'
---

# `document-editor-redesign` plan

### Phase `P01` - Foundations: corpus reader and formatting helper

Pure, unit-testable foundations the UI composes: a bounded stores selector exposing the pickable corpus (document stems, titles) and the existing feature-tag set derived in useMemo from the raw vault-tree slice, and a pure markdown formatting-insertion helper that wraps or line-prefixes the current selection. No wire changes, no new store shape.

- [x] `P01.S01` - Add a bounded stores selector exposing the pickable corpus and existing feature-tag set, derived in useMemo from the raw useVaultTree slice; `frontend/src/stores/server/queries.ts`.
- [x] `P01.S02` - Add a pure markdown formatting-insertion helper that wraps or line-prefixes the current selection and returns the new body plus caret range; `frontend/src/app/viewer/markdownFormatting.ts`.

### Phase `P02` - On-demand Properties popover

Replace the permanent 256px properties column with an on-demand kit Popover anchored to a Properties toggle button in the action bar; the body reclaims full width. The popover holds a vertical stacked form: the read-only directory tag, a single-select Feature combobox over existing feature tags, and a validated Date field, saved atomically through useSetFrontmatter. Closed by default; dismiss-on-escape/outside-click.

- [x] `P02.S03` - Replace the permanent PropertiesCard column with an on-demand kit Popover anchored to a Properties toggle button so the body reclaims full width; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `P02.S04` - Build the vertical Properties form inside the popover: read-only directory-tag row, single-select Feature combobox over the existing feature-tag set, and a validated Date field, saved through useSetFrontmatter; `frontend/src/app/viewer/PropertiesPopover.tsx`.

### Phase `P03` - Related-document linking picker

Inside the popover, a Related multi-select combobox: a SearchField filtering the useVaultTree corpus by stem and title, rendering selections as removable Chips and persisting them as wiki-link stems. Closes the core usability gap of linking against documents that actually exist.

- [x] `P03.S05` - Add the Related multi-select combobox over the corpus with removable Chips persisted as wiki-link stems to the Properties form; `frontend/src/app/viewer/RelatedDocPicker.tsx`.

### Phase `P04` - Formatting toolbar, keymap enrollment, and gate

A compact formatting toolbar of kit IconButtons (Lucide glyphs) that dispatch the pure insertion helper over the current selection (bold, italic, heading, bullet/ordered list, quote, inline code, link, wiki-link), read through a forwarded textarea ref. Formatting is a toolbar-only command surface with no bespoke keyboard accelerators (the obvious chords collide with Class-A globals like Mod+K and Mod+B); Save remains the one editor keymap-registry binding. Closes with a11y and guard/render tests plus the full lint gate.

- [x] `P04.S06` - Add the formatting toolbar of kit IconButtons dispatching the insertion helper over the selection as a single roving FocusZone tab stop, keeping Save as the one editor keymap-registry binding; `frontend/src/app/viewer/EditorToolbar.tsx`.
- [x] `P04.S07` - Add a11y attributes and guard/render tests for the toolbar, keymap enrollment, and popover, then run the full frontend lint gate to green; `frontend/src/app/viewer/MarkdownDocView.render.test.tsx`.

## Description

Redesign the markdown document editor per the accepted ADR: replace the permanent
horizontal properties column with an on-demand, vertical Properties popover; add
combobox pickers that link `related` and the feature tag against the live corpus; and
give the body a formatting toolbar. All UI composes existing kit primitives (`Popover`,
`SearchField`, `Chip`, `IconButton`, `PropertyRow`, Lucide glyphs) - no ad-hoc designs -
and stays within `app/` leaf-chrome and the frozen wire contract (`useVaultTree`,
`useSaveBody` / `useSetFrontmatter` / `useRenameDoc`, the editor slice). Editor verbs are
enrolled through the one keymap registry, not bespoke handlers.

## Steps

## Parallelization

`P01` is the shared foundation and lands first: `S01` (corpus reader) and `S02`
(formatting helper) are independent of each other and may run in parallel. `P02`
(popover) depends on `S01`; `P03` (Related picker) depends on both `S01` and the `P02`
popover it mounts inside; `P04` (toolbar) depends on `S02` and the `P02` action bar.
`P02 → P03` is a strict chain (the picker mounts in the popover form); `P04` may proceed
in parallel with `P03` once `P02`'s action bar exists. Every step touches `frontend/`
only and stays clear of the in-flight `universal-data-loading` work in the shared tree.

## Verification

- `just dev lint frontend` (eslint + prettier + tsc) exits 0 - the full gate, not a
  partial run.
- Vitest runs online against the live `vaultspec serve` fixture vault: unit tests for the
  corpus selector and formatting helper; render tests for the popover (closed by default,
  opens on demand, dismisses), the Feature and Related comboboxes (filter, add, remove),
  and the toolbar (wraps/inserts around the selection).
- Manual live check against the canonical SPA port: open a `.vault/` markdown doc, enter
  edit mode, confirm the body is full-width with no permanent column, open Properties on
  demand, link a related document from the picker, apply a formatting action, and save -
  observing the write lands through the existing mutations.
- Design conformance: no raw hex or hardcoded px (`lint:px` allowlist stays empty); every
  control resolves to a kit primitive; icons from the sanctioned Lucide set.
