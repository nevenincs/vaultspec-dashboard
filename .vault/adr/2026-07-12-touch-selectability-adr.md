---
tags:
  - '#adr'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-touch-selectability-audit]]"
  - "[[2026-06-15-dashboard-context-menus-adr]]"
  - "[[2026-06-21-keyboard-navigation-adr]]"
  - "[[2026-06-23-background-context-menus-adr]]"
  - "[[2026-07-08-mobile-enrichment-adr]]"
---

# `touch-selectability` adr: `text selection and touch interactivity standard: selection yields to no one` | (**status:** `accepted`)

## Problem Statement

The full-frontend touch-selectability audit found that corpus data text — document
titles, paths, branch names, commit subjects and hashes, dates, edge labels, statuses,
counts, prose, code — is pervasively unselectable, and that the context-menu plane and
the native text-selection plane have no arbitration rule. Three systemic defects
produce this. First, no `onContextMenu` handler anywhere consults
`window.getSelection()` before calling `preventDefault()`, so an active selection's
native menu (Copy / Search / Look Up) is always stolen by the app menu. Second, the
row-as-button idiom — reinforced by the keyboard-navigation `FocusZone` roving-tabindex
convention — renders data text as the direct content of `<button>` elements, which
structurally defeats long-press selection on touch and double-click word selection on
desktop; one authoring idiom repeated across the tree, code tree, worktree picker, doc
tabs, right-rail rows, islands, pickers, and palettes, plus wiki-link buttons that
break contiguous prose ranges inside the reader. Third, touch has no deliberate menu
entry at all: iOS never fires `contextmenu`, Android's long-press collides with the
unconditional hijack, and no long-press or per-row affordance exists. This ADR engraves
one standard — where data lies beneath, text is selectable and the selection owns its
native menu — and defines the mechanisms every module converges on.

## Considerations

- The context-menus ADR standardised the in-place verb surface (one resolver registry,
  one host, one dispatch seam) and the background-context-menus ADR layered empty-space
  menus behind per-entity resolvers. Neither states a relationship to text selection;
  this ADR adds that missing law without re-deciding either.
- The keyboard-navigation ADR mandates `FocusZone` roving tabindex with one tab stop
  per composite. Its examples use `<button>` rows, but nothing in the decision requires
  the focusable row element to be a button, nor requires `user-select` suppression;
  CSS `user-select: text` on a button re-enables selection in every engine the app
  targets. The standard can therefore compose with `FocusZone` unchanged.
- Browser facts that bound the design: `contextmenu` never fires on iOS Safari;
  long-press on selectable text opens the selection loupe/callout on both mobile
  platforms; buttons and `role="button"` spans suppress selection by default UA
  behaviour; `preventDefault()` on `contextmenu` also suppresses the selected-text
  native menu on Android long-press.
- The kit atoms (`ListRow`, `PropertyRow`) are already selectable divs, global CSS
  carries zero suppression, and the diff/code gutters show the correct scoping of
  `select-none` — the standard codifies existing best practice rather than inventing
  a new one.
- Warmth/design-system laws are untouched: no visual change is implied beyond focus
  and selection behaviour; labels-are-user-facing and token rules continue to bind.

## Considered options

- **Per-surface patches (rejected).** Fix each hijack and each button row where found.
  Repeats the audited defect pattern: the idiom regenerates with every new surface, and
  fourteen-plus hijack sites drift independently.
- **Global CSS re-enable (`* { user-select: text }`) (rejected).** Blunt: makes chrome
  verbs, gesture scrubbers, and menu rows selectable, degrading drag/press
  interactions; the audit shows suppression is needed, just scoped.
- **Replace row buttons with divs + click handlers (rejected).** Destroys the
  keyboard-navigation contract (native button semantics, Enter/Space activation,
  screen-reader roles) that the FocusZone convention depends on.
- **One shared guard + row-selectability convention + explicit touch entry (chosen).**
  A single selection-guard helper wraps every app-menu open; data text stays inside
  the existing focusable rows but is re-enabled with `user-select: text` (or moved
  beside the control where ranges must stay contiguous, as in prose); touch gains a
  deliberate menu affordance instead of overloading long-press.

## Constraints

- The context-menu resolver registry, `ContextMenuHost`, keymap dispatcher, and
  `FocusZone` are stable, accepted, and shipped; this ADR builds on them and must not
  change their surfaces (a view rewrite freezes the contract).
- `user-select: text` inside buttons is mature CSS with universal support in the
  app's target engines; no library or frontier dependency is introduced.
- The selection guard must be authored once and imported by every menu-opening
  surface; a second bespoke guard is the defect recurring. It lives beside the
  existing shared helper in `app/menus/backgroundContextMenu.ts` or as a sibling
  substrate module — app-layer, store-free, unit-testable pure function.
- Touch affordances must not add standing commands to the palette registry or new
  wire traffic; they are pure chrome over the existing `openContextMenu` seam.
- Existing guard suites (`actionCoverage`, `backgroundContextMenu`, `ContextMenuHost`
  render tests) must keep passing; new laws get their own guard tests so regressions
  fail loudly.

## Implementation

**D1 — the selection-guard law.** One shared helper (`guardedContextMenu`, sibling of
`backgroundContextMenuHandler`) wraps every app context-menu open. It reads
`window.getSelection()`; when the selection is non-collapsed and intersects the
handler's target element, the handler returns without `preventDefault()` — the native
selected-text menu wins. When the selection is collapsed, elsewhere, or absent, the
app menu opens as today. All existing `onContextMenu` sites that open the resolver
menu route through this helper; the background helper gains the same guard clause so
future text-bearing background surfaces inherit it. The island handler additionally
gains a proper target predicate (like the rail/timeline predicates) so nested data
targets stop being blanketed.

**D2 — data text is selectable; suppression is scoped to adjuncts.** The data/chrome
boundary is defined: corpus-derived strings are data; verbs, tab names, and control
labels are chrome. Data text inside a `FocusZone` row (tree rows, code tree, worktree
picker, doc tabs, commit rows, edge rows, island interiors, picker/palette results)
stays inside the existing `<button>` for keyboard semantics but the row (or its data
spans) carries `user-select: text` so pointer and touch selection work; press/drag
handlers must not `preventDefault()` on `mousedown`/`pointerdown` over data spans.
`select-none` remains sanctioned only for presentation adjuncts: line-number and
diff-marker gutters, gesture scrubber chrome — never a data column; the timeline
range readout is carved out of the scrubber's suppression. Inside reader prose,
wiki-links and Related-footer stems stop rendering as `<button>` islands: they render
as anchor-shaped selectable elements with the same activation and keyboard reachability,
so a sentence containing a link selects as one contiguous range.

**D3 — touch owns selection on long-press; the menu gets a deliberate entry.**
Long-press on data text is reserved for the platform selection gesture and is never
intercepted. The app menu on touch is reached explicitly: on compact/coarse-pointer
viewports, menu-bearing rows expose the existing keyboard-menu pathway as a visible
per-row disclosure affordance (one shared chrome control over the `openContextMenu`
seam, rendered only on coarse pointers), and Android's native long-press `contextmenu`
event routes through the D1 guard so selection still wins where text is selected.
Gesture recognizers over prose (compact reader edge-swipe) yield when a selection is
active.

**D4 — the laws are guarded.** A selection-guard unit suite covers the helper's
yield/open matrix; a row-selectability render assertion sweeps menu-bearing surfaces
for `user-select` suppression over data text; the island predicate gets the same
background-predicate tests the rails have. New surfaces that register a resolver
without routing through the guard fail the guard test.

## Rationale

The audit's cross-cutting analysis shows one idiom, not many bugs: rows-as-buttons
plus unguarded hijacks. Fixing the substrate once (guard helper, row convention,
touch affordance) converts fourteen-plus scattered defects into three mechanisms with
tests, which is the same consolidation shape the context-menus and keyboard-navigation
ADRs used successfully. Selection-yields-to-no-one matches the cohort (VS Code,
Linear, native platforms): no mainstream tool replaces the native selected-text menu,
and none makes visible data text unselectable on purpose. Keeping buttons for rows
preserves the accepted keyboard model at zero cost because `user-select: text`
composes with it.

## Consequences

- **Gains.** Every data string in the app becomes copyable on desktop and touch; the
  native selection menu is never stolen; iOS users gain their first working entry to
  the context-menu plane; the data/chrome boundary becomes a named, testable law that
  future surfaces inherit.
- **Costs / difficulties.** Re-enabling selection inside activatable rows introduces
  the classic drag-vs-select tension: a press-and-move on a row now starts a selection
  rather than nothing; surfaces with drag semantics (dock tabs) must scope
  `user-select: text` to the title span only. The per-row touch disclosure adds one
  chrome control to compact rows and needs design-system care to stay quiet. The
  wiki-link element change touches the reader's markdown component overrides and its
  tests.
- **Pathways.** The guard helper is the natural future home for other native-plane
  arbitration (e.g. native image context menus); the coarse-pointer disclosure
  affordance generalises to any future touch-only verb surface.
- **Pitfalls.** A new surface hand-rolling `onContextMenu` without the guard silently
  reintroduces the defect — the D4 guard test is the fence. Partial adoption
  (guarding some sites) would make behaviour inconsistent across surfaces, which is
  worse than the status quo; the unification pass must sweep all sites in one
  campaign.

## Codification candidates

- Selection is never stolen: every app context-menu open routes through the one
  shared selection guard; `select-none` only on presentation adjuncts, never data.
- Data text renders selectable everywhere: corpus-derived strings never rely on
  interactive-element default suppression; rows re-enable selection explicitly.
