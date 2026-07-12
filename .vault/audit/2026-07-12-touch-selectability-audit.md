---
tags:
  - '#audit'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
related: []
---

# `touch-selectability` audit: `text selection and touch interactivity across every frontend module`

## Scope

Full-frontend survey of text-selectability suppression, focus-state treatment, and
touch interactivity on every surface that carries data text, with special weight on
surfaces where a context menu is online through the layered resolver registry
(`platform/actions/registry.ts`, `app/menu/ContextMenuHost.tsx`, per-surface resolvers
under `app/*/menus/`). The driving architectural question: wherever corpus-derived
data text sits beneath a pointer (document titles, paths, dates, statuses, counts,
code, prose), the user should be able to select that text — on desktop and on touch —
even though a context menu is also available there. The audit inventories every
mechanism that currently defeats this (data text inside `<button>` elements, explicit
`select-none`, unconditional `preventDefault()` in `onContextMenu`, roving-tabindex
focus capture, touch-action restrictions, absent long-press affordances) so one
standard can be engraved in an ADR and unified across all modules. Chrome labels
(verbs, tab names) being unselectable is in-scope only as a boundary definition, not
a defect.

## Findings

### systemic-no-selection-guard | critical | No surface consults the active text selection before hijacking the context menu

`window.getSelection()` and `selectionchange` appear nowhere in the frontend. Every
`onContextMenu` handler that opens the app menu calls `event.preventDefault()`
unconditionally, so a user who has selected text and right-clicks (or long-presses on
Android) gets the app entity menu instead of the native selected-text menu
(Copy / Search / Look Up). The selection is visually kept but its operative menu is
stolen. This is the root architectural gap: the app plane and the native selection
plane have no arbitration rule.

### touch-has-no-menu-entry-and-no-selection | critical | Touch has neither a working context-menu entry point nor selectable data rows

No long-press affordance exists anywhere in `app/` (the only pointer-timer logic is
the scene field, the timeline scrubber, and outside-pointer dismissal). iOS Safari
never fires `contextmenu`, so on iOS the entire context-menu plane is unreachable by
touch; on Android long-press does fire `contextmenu`, where the unconditional hijack
then also suppresses the text-selection loupe. Because data rows are `<button>`
elements (below), long-press text selection is structurally dead on them too — touch
users can neither open the menu deliberately nor select the data. Touch currently
gets the worst of both planes.

### tree-rows-are-buttons | high | Vault tree rows render data text inside `<button>` elements, killing selection by construction

`app/left/TreeBrowser.tsx` renders every row — document title, meta line, date, count —
as a `<button>` with roving `tabIndex` from `useFocusZone`. Buttons are not
text-selectable by long-press on touch and resist double-click word selection on
desktop. The convention is codified: the rail background predicate in
`app/menus/backgroundContextMenu.ts` documents that "every row is a `<button>`". A
context menu is online on every row level (`vaultDocMenu`, `vaultFeatureMenu`,
`vaultCategoryMenu`, `vaultSectionMenu`), so these are exactly the menu-bearing
data surfaces the design decision targets.

### code-tree-button-rows | high | Code tree rows repeat the button-row pattern over file path data

`app/left/CodeTree.tsx` renders code-file entries (path segments, names) as `<button>`
rows with an unconditional `preventDefault()` context-menu hijack opening the
`code-file` resolver. File paths are high-copy-value data text; none of it is
selectable.

### doc-viewer-contextmenu-hijack | high | The document viewer hijacks right-click over the whole prose surface

`app/viewer/MarkdownDocView.tsx` attaches `onContextMenu` with `preventDefault()` to
the entire view-mode container, opening the `vault-doc` menu. The prose itself is
selectable (rendered in plain divs), but any right-click or Android long-press over a
selection replaces the native copy menu with the app menu. This is the highest-traffic
reading surface; selection-over-prose is its primary data interaction.

### kit-primitives-are-clean | low | The kit row primitives are selectable divs; suppression is authored per-surface

`app/kit/ListRow.tsx` and `app/kit/PropertyRow.tsx` render plain `<div>`/`<span>`
structure with no selection suppression — data text inside them is selectable
wherever surfaces compose them without a wrapping `<button>`. The unification work
therefore lands in the surfaces (and one shared row-interaction convention), not in
the kit atoms.

### gutter-select-none-is-correct | low | Line-number gutters correctly opt out of selection

The code-viewer gutter (`stores/view/codeViewer.ts`) and the diff panel line numbers
(`app/authoring/DiffPanel.tsx`) carry `select-none` so copied code and diffs exclude
line numbers. This is the sanctioned use of suppression — presentation-only adjuncts
next to selectable data — and should be named as such in the standard.

### timeline-scrubber-select-none | low | The timeline range scrubber suppresses selection as gesture chrome

`app/timeline/TimelineRangeSelector.tsx` applies `select-none` to the scrubber rows.
These are drag-gesture chrome; the suppression is appropriate, but the date labels
inside are borderline data and should be re-checked once the standard defines the
data/chrome boundary.

### compact-reader-gesture-race | medium | The compact doc reader's edge-swipe gesture shares the surface with prose selection

`app/shell/CompactDocReader.tsx` sets `touchAction: "pan-y"` and mounts an edge-swipe
back gesture over the reading surface. Vertical scroll and selection largely survive,
but a long-press beginning near the leading edge can race the swipe recognizer; the
standard should state that gesture recognizers over prose must yield to selection.

### global-css-is-clean | low | No global selection suppression exists

`styles.css` contains no `user-select`, `touch-action`, `-webkit-touch-callout`, or
tap-highlight suppression; all suppression is authored locally per surface. The
unification can therefore proceed additively without first unwinding a global default.

### background-menu-layer-is-sound | low | The background empty-space menu never shadows data targets

`app/menus/backgroundContextMenu.ts` fires only when the right-click target is
genuinely background (`target === currentTarget` or the rail/timeline predicates), so
it never steals a data row's menu. Its `preventDefault()` runs only over empty space
where no text exists; it needs no selection guard.

### worktree-picker-rows-unselectable-with-menu | high | Worktree, project, and recent rows are buttons carrying data text with a live menu and unconditional preventDefault

`app/left/WorktreePicker.tsx` renders the worktree name, branch label, absolute path
pill, and project labels as text nodes inside `<button>` rows, so no click or
long-press can start a selection there. The worktree row also registers
`onContextMenu` with an unguarded `preventDefault()` and its resolver
(`app/left/menus/worktreeMenu.ts`) is live — exactly the menu-online, data-beneath,
unselectable combination the standard targets. Paths and branch names are among the
highest-copy-value strings in the app.

### markdown-reader-inline-wikilinks-break-prose-selection | high | Wiki-link text renders as buttons inside otherwise-selectable prose

`app/viewer/MarkdownReader.tsx` overrides anchor rendering so a wiki-link's visible
text — ordinary sentence content — becomes a `<button>`, and the Related footer wraps
document stems in buttons. The article body is otherwise genuinely selectable, but
any sentence containing a wiki-link cannot be selected as one contiguous range: the
button island breaks it. Combined with the host `MarkdownDocView` contextmenu hijack,
the most-used reading surface has both broken selection ranges and a stolen native
selection menu.

### palette-and-picker-result-rows-wrap-data-text-in-buttons | medium | Every list-style picker wraps result data text fully inside buttons

`app/palette/CommandPalette.tsx`, `DocumentSearchSurface.tsx`,
`SearchPaletteSurface.tsx` (via `SearchResultPill` — title, why-excerpt, feature tag),
`app/viewer/AutocompleteCombobox.tsx`, and `app/left/FeatureSearchField.tsx` all
render corpus data text as direct `<button>` content. No context-menu resolver is
online on these listbox surfaces, so they miss the strict high bar, but the
structural defect is identical and repeated across every picker; on the compact
full-screen search surface, long-press-to-select a result title is impossible.

### workspace-switcher-and-project-navigator-rows-unselectable-no-menu | medium | Mobile workspace switcher and project navigator wrap names in buttons

`app/shell/WorkspaceSwitcherSheet.tsx` and `app/left/ProjectNavigator.tsx` render
worktree/project/recent names as button content with no menu registered. The switcher
sheet is the sole touch-reachable worktree switcher on compact, and long-press there
cannot select a worktree or branch name to copy it.

### background-handler-establishes-unguarded-idiom | low | The shared background-menu helper carries no selection guard for future consumers

`app/menus/backgroundContextMenuHandler` calls `preventDefault()` with no
`getSelection()` check. Its predicates keep it off data text today, but as the one
shared context-menu primitive it is where the selection-guard idiom should live once;
any future background surface showing text inherits the gap silently.

### shell-left-clean-surfaces | low | Settings, chrome, and most shell/left/viewer files are clean

Settings controls, the chrome focus machinery (`useFocusZone`, `focusTrap`,
`keyboardContextMenu`, dialogs, sheets), rail fields, `DocChrome`, `CodeViewer` /
`HighlightedCode` (source rendered as plain spans, fully selectable, no menu), and
the compact shell bars carry only chrome verbs inside interactive elements or render
data text as plain spans. `RelatedDocPicker` demonstrates the correct pattern — the
linked stem is a plain span sibling of its remove button. The only touch-action
override in scope is the deliberate `pan-y` on the compact reader. Sweep counts:
about 45 files, 2 high, 3 medium, 1 low.

### cross-cutting-listbox-row-idiom | high | One repeated authoring idiom — row-as-button with data text as button content — is the dominant cause

Across dropdowns, pickers, palettes, and roving-tabindex zones, the row's data text
is the direct text content of the interactive `<button>` rather than a
non-interactive text node beside or beneath a click target. This is one idiom
repeated, not independent decisions, so the unification is naturally a shared
row-primitive convention change; the touch-selection fix and the button-wrapping fix
are the same fix in the same place.

### inspector-edge-buttons-unselectable | high | Edge and tier data text sits inside buttons on a menu-bearing panel

`app/right/Inspector.tsx` renders the tier-fold header and each edge row (edge
display label, tier name, edge count — all corpus data) inside `<button>` elements,
while the `edge` kind has a live resolver (`edgeMenu.ts`). Edge relation labels a
reviewer would copy cannot be selected.

### inspector-node-panel-no-selection-guard | high | The node detail panel steals the native menu over selectable title and properties

The Inspector node-detail wrapper holds the node title and property list as plain,
structurally selectable elements — but its `onContextMenu` calls `preventDefault()`
unconditionally before opening the `node` menu, so right-click on selected
title/property text always replaces the native copy menu.

### doctab-title-role-button | high | The document tab title is a role=button span with a hijacked menu

`app/stage/DockWorkspace.tsx` wraps the open document's title in a
`role="button" tabIndex={0}` span, structurally blocking selection, and the tab's
`onContextMenu` unconditionally prevents default with the `doc-tab` resolver online.
The one string users most want to copy — the open document's title — is unselectable
both structurally and event-wise.

### recent-commit-row-button-with-menu | high | Commit subject, hash, and age render inside a button with a live menu

`app/right/StatusTab.tsx` wraps the commit short hash, subject, and age inside a
`<button>`, and the row's `onContextMenu` prevents default unguarded with the
`commit` resolver online. Commit messages cannot be selected at all.

### island-contextmenu-blankets-nested-data | high | The island menu handler is un-scoped and blankets all nested data text

`app/islands/IslandLayer.tsx` fires its `onContextMenu` on every right-click anywhere
inside the island — not gated on `target === currentTarget` like the background
predicates — and unconditionally prevents default, always opening the `island` menu.
Nested `NodeInterior` data (feature-lifecycle chips, plan step titles) is never
reachable by native selection or copy. The worst-scoped handler found.

### timeline-readout-select-none | high | The computed date-range readout is select-none data text

`app/timeline/TimelineRangeSelector.tsx` applies `select-none` to the whole strip,
including the computed range readout — data, not chrome. The timeline background
menu predicate does not exempt the readout span, though the CSS suppression already
blocks selection before the menu question arises. The date labels must be carved out
of the gesture chrome's suppression.

### right-rail-button-rows-no-menu-yet | medium | Plan titles, step headings, and changed-file names repeat the button pattern without menus

`app/right/StatusTab.tsx` (plan pill title), `app/right/ChangesOverview.tsx`
(filename plus numstat), and `app/right/PlanStepTree.tsx` (step id and heading) wrap
data text in `<button>` rows with no resolver registered today — the same latent
structural defect, which becomes a high finding the moment those kinds gain menus.

### diff-gutter-scoping-is-the-model | low | The diff panel scopes suppression exactly right

`app/authoring/DiffPanel.tsx` applies `select-none` only to the aria-hidden gutter
glyph span; the diff text itself is a plain selectable span. Together with the code
gutter, this is the convergence pattern for the standard: suppression only on
presentation-only adjuncts, never on the data column.

### transient-and-chrome-surfaces-clean | low | Hover card and graph chrome need no action

The right-rail `HoverCard` renders plain selectable elements and is a transient
inspect-only overlay with no resolver; `CategoryLegend` and `GraphControls` labels
are chrome verbs where buttons are the correct idiom. Right/stage sweep counts: 29
files read fully, 5 high, 3 medium, 3 low.

## Recommendations

The findings reduce to two systemic defects plus one absent capability, so the
remedy is one standard with three planks, engraved as an ADR and applied as a
unification pass — not per-surface patches.

- **Plank 1 — selection-guard law for the menu plane.** Every `onContextMenu` that
  opens the app menu must yield to a live text selection: when the selection is
  non-collapsed and intersects the target, do not `preventDefault()` — let the
  native selected-text menu win; the app menu re-arms once the selection collapses.
  Author the guard ONCE (a shared `guardedContextMenu` helper co-located with
  `backgroundContextMenuHandler`, or inside `openContextMenu` itself) and route all
  fourteen-plus hijack sites through it. The un-scoped island handler additionally
  gains a target predicate like the rails.
- **Plank 2 — data text never renders as interactive-element content.** Define the
  data/chrome boundary in the ADR: corpus-derived strings (titles, paths, hashes,
  dates, statuses, counts, prose, code) render as plain text nodes; the row's
  activation affordance wraps or sits beside them without making the text the
  button's own content (the `RelatedDocPicker` badge and diff-gutter scoping are the
  in-repo models). Where a row must stay a single `<button>` for the FocusZone
  roving contract, the row carries `select-text` (`user-select: text`) so selection
  is re-enabled inside it — buttons permit this via CSS — and `select-none` is
  reserved for presentation-only adjuncts (gutters, gesture chrome), never the data
  column. Wiki-links inside prose stop being buttons; an anchor-shaped element with
  the same activation keeps sentence ranges contiguous.
- **Plank 3 — touch gets a deliberate, selection-compatible menu entry.** Long-press
  cannot serve both selection and the app menu, and iOS never fires `contextmenu`;
  so touch selection owns long-press on data text, and the app menu gets an explicit
  touch affordance (a per-row disclosure target or the existing keyboard-menu
  pathway surfaced on compact), with Android's long-press `contextmenu` routed
  through the same Plank-1 guard. Gesture recognizers over prose (compact reader
  edge-swipe) must yield to an active selection.

Fix ordering: author the shared guard + row conventions first (one substrate
change), then sweep surfaces by severity — viewer/doc-tab/tree/worktree picker
(high, menu online), right-rail rows and islands (high), pickers and palettes
(medium), then the medium no-menu-yet rows so the latent defect never matures.
Guards: extend `actionCoverage`/`backgroundContextMenu` test suites with a
selection-guard unit and a row-selectability render assertion so regressions fail
loudly.
