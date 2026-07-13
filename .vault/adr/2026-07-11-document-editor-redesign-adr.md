---
tags:
  - '#adr'
  - '#document-editor-redesign'
date: '2026-07-11'
modified: '2026-07-11'
related:
  - '[[2026-06-18-editor-dock-workspace-research]]'
---

# `document-editor-redesign` adr: `metadata editor, controls, and linking pickers` | (**status:** `accepted`)

## Problem Statement

The markdown document editor shipped as an unspecified stub: it was assembled
incrementally across the editor-dock-workspace and editor-figma-parity work with no
governing decision record. Nobody decided what the editor's editing content should be,
what controls it offers, what actions it exposes, its context menu, or how metadata is
edited. The gaps are now visible defects:

- The **metadata (properties) editor is a permanent horizontal column** — a fixed
  256px card pinned to the right of the body textarea, shown for the entire edit
  session. It squeezes the writing surface and blocks the document even when the author
  is not editing metadata. Advanced, rarely-touched controls occupy prime editing width
  by default.
- The metadata fields are **freeform comma-separated text inputs** (`tags`, `date`,
  `related`). Populating `related` means hand-typing document stems with no validation
  against what exists; the same for the feature tag. There is no way to link against
  existing documents — no picker, no autocomplete, no chips.
- The **body editor has no editing controls at all** — a raw highlighted textarea. No
  formatting affordances, no wiki-link insertion, nothing that helps author `.vault/`
  markdown.

The author's directive: the advanced property editor must be **hidden by default,
opened on demand, and vertical**; new UI must reuse the existing design-system language
(kit primitives, OKLCH token tier, Lucide/Phosphor icons) with no ad-hoc designs.

## Considerations

- **Design-system law (binding).** Every control resolves to a shared kit primitive, a
  bound color token, or a shared text/elevation style — never a hand-built widget or
  raw hex/px. The kit already exports `Popover`, `DropdownButton`, `FoldSection`,
  `Chip`, `SearchField`, `PropertyRow`, `IconButton`, `Divider`, and the sanctioned
  Lucide glyph set — the complete atom set this redesign needs. This is a composition
  task, not a new-primitive task.
- **Layer law (binding).** The editor lives in `app/` leaf chrome: it fetches nothing
  and reads no raw `tiers`. Any corpus data a picker searches must arrive through an
  existing stores reader (`useVaultTree` already serves the bounded vault-document
  listing), not a new fetch in `app/`.
- **Actions/keymap/palette law (binding).** Save is authored as a shared action
  descriptor bound through the one keymap registry — never a bespoke global `keydown`.
  Formatting is a TOOLBAR-only command surface: the toolbar buttons are the command
  affordance, and there are deliberately no bespoke formatting keyboard accelerators on
  the textarea. A selection-applying command needs the focused textarea a global keymap
  thunk cannot reach, and the obvious chords collide with existing Class-A globals
  (`Mod+K` = command palette, `Mod+B` = left-rail toggle); a private textarea `keydown`
  for them would swallow those global commands — the exact failure the law forbids.
  Class-B widget-intrinsic keys (toolbar roving, combobox arrow/enter/escape, popover
  dismiss-on-escape) stay in their components.
- **Store-selector law (binding).** Picker corpus lists derive in `useMemo` over a raw
  stores slice, never inside the selector.
- **Vault taxonomy reality.** A `.vault/` document carries exactly two tags: one fixed
  directory tag (set by folder, not author-editable) and one feature tag. So the
  author-facing "tags" and "features" surfaces collapse into a **single feature
  control**; the directory tag is displayed read-only, never a free text field.
- **Honest editing model.** This is a spec-authoring tool over raw markdown; the
  rendered output is already the View mode. WYSIWYG is out of scope and off-brand.
- **Wire write path.** Saving stays on the existing `useSaveBody` / `useSetFrontmatter`
  / `useRenameDoc` mutations (the sole wire clients); the redesign changes presentation
  and input controls, not the write contract.

## Considered options

- **Metadata panel — permanent column (status quo):** rejected. It is the defect: it
  blocks the document and violates the hidden-by-default / on-demand directive.
- **Metadata panel — Popover anchored to a Properties button (CHOSEN):** hidden by
  default, opened on demand, a vertical stacked form floating over a full-width editor;
  a single kit primitive with built-in dismiss-on-escape/outside-click. Keeps the
  writing surface full width. Chosen for being the lightest fully-compliant option.
- **Metadata panel — slide-in right drawer:** viable and roomier for the picker, but a
  heavier overlay with focus-management and dimming concerns; kept as the documented
  fallback if the Popover proves cramped for the related-doc picker + chips.
- **Metadata panel — inline FoldSection below the chrome:** vertical and on-demand but
  pushes the body down on every open; rejected as more disruptive than a floating
  panel.
- **Body controls — raw textarea only (status quo):** rejected; gives the author no
  help writing `.vault/` markdown and no wiki-link insertion.
- **Body controls — formatting toolbar + linking pickers, no preview (CHOSEN):** a
  compact toolbar of kit `IconButton`s wrapping/inserting markdown around the selection
  (bold, italic, heading, bullet/ordered list, quote, inline code, link, wiki-link),
  plus the metadata pickers. Source editing stays raw-and-honest; rendered output stays
  the View tab. Chosen as the right altitude for a spec tool.
- **Body controls — add an in-editor live-preview split:** deferred. A side-by-side
  preview reintroduces the same width-squeeze the author objected to, and the View tab
  already renders. Explicitly out of scope for this redesign; may return as an
  on-demand, off-by-default toggle in a follow-on.
- **Linking — freeform comma text (status quo):** rejected; no validation, no discovery.
- **Linking — combobox pickers over the live corpus (CHOSEN):** `related` is a
  multi-select combobox searching existing documents, rendering selections as removable
  tokens (the dot-less kit `Badge` pill, since a link token carries no category dot);
  the feature is a single-select combobox over existing feature tags. Both read the
  corpus through `useVaultTree`.

## Constraints

- **No new wire contract.** The redesign consumes existing stores hooks
  (`useVaultTree`, `useSaveBody`, `useSetFrontmatter`, `useRenameDoc`,
  `useDocumentEditorView`, the editor slice) unchanged. A picker needs the vault
  document listing and the set of existing feature tags; both are derivable from the
  already-served vault tree. If the feature-tag set is not cleanly derivable client-side
  from the tree, a bounded stores selector derives it from the tree slice — no new
  engine route unless a follow-on proves one necessary (flagged, not assumed).
- **Parent-feature stability.** Builds directly on the stable editor slice
  (`stores/view/editor.ts`), the ledgered-edit save path, and the kit — all shipped and
  green. No frontier risk.
- **Bounded pickers.** The corpus listing a picker walks is already bounded by the vault
  tree's server ceiling; the combobox filters client-side over that bounded slice and
  caps rendered results.

## Implementation

Five layers, composed from existing atoms:

1. **Editor action bar** — the existing status/save row gains a **formatting toolbar**
   (kit `IconButton`s, Lucide glyphs) and a **Properties** toggle button; rename moves
   into the Properties popover. Save / Done keep their placement and mutations. Save
   stays the one editor keymap-registry binding; the formatting toolbar is a plain
   command surface (toolbar-only, no colliding keyboard chords — see the actions law
   consideration). The toolbar is one roving `FocusZone` tab stop.

2. **Formatting insertions** — a pure text-transform helper wraps or line-prefixes the
   current textarea selection (emphasis, headings, lists, quote, code, link, wiki-link),
   returning the new body + caret range. The toolbar reads the live selection through a
   forwarded textarea ref, feeds the result to `updateEditorDraft`, and restores the
   caret in a layout effect. The editor slice already owns the draft; no new store shape.

3. **Properties popover** — replaces the permanent `PropertiesCard` column with an
   on-demand kit `Popover` anchored to the Properties button. Closed by default; opens a
   **vertical** stacked form. Composed from `PropertyRow` / kit inputs; dismiss-on-escape
   and outside-click are the popover's intrinsic behavior. The body textarea reclaims
   full width.

4. **Linking pickers** — inside the popover: a **Related** multi-select combobox
   (`SearchField` filtering the `useVaultTree` corpus, selections as removable `Badge`
   tokens, persisted as wiki-link stems) and a **Feature** single-select combobox over
   the existing feature-tag set. The **Date** field stays a validated input. The
   read-only directory tag is shown via `PropertyRow`, not editable. Draft edits still
   save atomically through `useSetFrontmatter`. Both comboboxes compose one shared
   `AutocompleteCombobox` mirroring the rail's canonical feature-search field.

5. **Corpus reader** — a bounded stores selector exposes the pickable corpus (document
   stems + titles) and the feature-tag set, derived in `useMemo` from the raw vault-tree
   slice per selector law. The editor consumes it; it fetches nothing itself.

Context menu: the existing right-click vault-doc menu is retained unchanged. Formatting
lives on the toolbar, not a bespoke editor context menu — no verb is duplicated across
the menu resolver layers.

## Rationale

The redesign is governed by the binding design-system and layer laws: every element
named above already exists as a kit atom or a stores reader, so the work composes rather
than invents, satisfying "no ad-hoc designs" by construction. The Popover directly
encodes the author's hidden/on-demand/vertical directive with the least machinery. The
combobox pickers close the real usability gap — linking against documents that actually
exist — while keeping the write path and wire contract frozen. Deferring live preview
keeps the redesign focused on the stated defects and avoids re-introducing the
width-squeeze the author objected to.

## Consequences

- **Gains:** the writing surface is full-width by default; metadata is a deliberate,
  on-demand act; `related` and feature values are validated against the real corpus,
  eliminating dangling wiki-links from typos; the body gains real authoring help; every
  new control is a shared primitive, so theming and a11y come for free.
- **Costs / difficulties:** a combobox nested inside a popover needs careful focus and
  dismiss handling (mitigated by using the kit `Popover`'s intrinsic behavior and
  keeping the combobox list inline rather than a second floating layer); deriving the
  feature-tag set client-side assumes the vault tree carries enough — if it does not, a
  bounded stores derivation or (last resort, flagged) a small engine listing is the
  fallback.
- **Pitfalls:** formatting insertions must be enrolled through the keymap registry, not
  private `keydown` listeners, to satisfy the actions law; the Properties popover must
  not become a second home for corpus filters (filtering law) — it edits this
  document's frontmatter only.
- **Opens:** a clean seam for a future on-demand preview toggle and for richer
  slash/`[[`-triggered inline wiki-link autocomplete in the body, both deferred here.
