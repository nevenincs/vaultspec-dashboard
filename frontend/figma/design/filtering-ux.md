# Filtering UX — ground-up rewrite

The existing FilterSidebar is discarded. This is the design the Figma build executes.

## Why the old one fails
Scattered always-on toggles in a sidebar: no sense of a *query*, no live feedback on what a
toggle does, no way to see/clear the active filter set at a glance, hides results (destroys
context), can't be saved or recalled, not keyboard-composable. It treats filtering as a panel
of switches instead of *asking a question of the graph*.

## Model: a composable query, not a panel of switches
Filtering = building a small **query** from **facet chips** that combine (AND across facets,
OR within a multi-select facet). The query lives in ONE bar, always visible, always reversible,
with **live result counts** and **dim-not-hide** application on the active surface.

### Facets (the vocabulary of the graph)
- **doc-type** — research / adr / plan / exec / audit / index / code (multi-select)
- **tier** — declared / structural / temporal / semantic
- **feature** — `#feature` tags (searchable multi-select)
- **lifecycle** — active / complete / archived / stale / broken
- **plan-status** — not-started / in-progress / complete (only meaningful for plans)
- **date** — created/modified range (relative presets: today/7d/30d/custom)
- **connectivity** — has-edges / orphaned / degree ≥ N
- **text** — free-text contains (rides the same bar, leftmost)

## Anatomy (the filter bar — one cohesive surface, top of the active surface)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 🔍 search…   [type: plan ✕] [tier: structural ✕] [#dashboard-* ✕]  + Add ▾  │
│                                                            142 → 18 · Reset  │
└────────────────────────────────────────────────────────────────────────────┘
   ▲ free text     ▲ active facet chips (removable)        ▲ live count + reset
```

- **Active facets render as removable chips** (the `Chip` kit component, `accent-subtle` fill,
  `accent-text` label, trailing ✕). The set IS the query — visible, never hidden in a panel.
- **`+ Add ▾`** opens a compact facet menu (the `Menu` kit): pick a facet → inline value
  picker (checkbox list for multi-select, range for date, segmented for tri-state). Composing
  is one click + pick, keyboard-first (`/` focuses, `f` opens Add, arrows + space to pick).
- **Live count** (`142 → 18`) updates as you compose — filtering narrows the already-loaded
  set, never a round-trip. `Reset` clears all chips at once.
- **Saved views**: a star/▾ at the bar's right saves the current chip set as a named preset
  ("stale plans", "this feature's lineage"); presets reload the exact chips.

## Application — dim, don't hide (preserve context)
- **Graph**: non-matching nodes drop to ~12% opacity + lose labels; matches stay full, edges
  to matches keep weight. The constellation shape is preserved so you keep your bearings.
- **Tree / table**: non-matches dim and collapse-defer; matches stay crisp. A "showing 18 of
  142" line sits under the bar.
- Filtering is **scoped to the active surface** but the chip set is shared, so switching
  graph↔tree keeps the question.

## States (all designed in Figma)
- **Empty (no filters)**: bar shows only search + `+ Add`, faint hint "filter by type, tier,
  feature…". Full corpus, nothing dimmed.
- **Composing**: facet menu open, value picker inline, count previewing.
- **Active**: chips + live count + reset; surface dimmed to matches.
- **Over-filtered (0 matches)**: bar turns the count amber, inline message
  "no nodes match — relax a facet", with each chip offering a one-tap loosen. Never a dead end.
- **Saved-view active**: preset name shown as a leading pill; editing chips marks it "modified".

## Kit components used (all from §5 — proves the kit)
SearchField, Chip (removable + count badge), Menu (facet picker + value pickers), SegmentedToggle
(tri-state values), Button (Reset/Save), Panel (the bar is a `paper-raised` bar w/ `raised`
elevation). Colour 100% bound. Type: meta/label scales. Keyboard map shown on the frame.

## Figma deliverables (frames to build)
1. `surface/Filtering — empty`  2. `— composing (facet menu + value picker open)`
3. `— active (chips + dim applied on a graph mini)`  4. `— over-filtered`  5. `— saved views`
Each reviewed by the no-context UX reviewer for: is the active query obvious at a glance? is
adding/removing a facet a one-gesture action? is the result feedback immediate and honest?
