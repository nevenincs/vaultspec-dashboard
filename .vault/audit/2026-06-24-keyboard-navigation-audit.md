---
tags:
  - '#audit'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-07-12'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# `keyboard-navigation` audit: `keyboard navigation review`

## Scope

The W07.P11.S35 formal review of the keyboard-navigation campaign: the two-tier
focus model (Tab between regions, arrow within) built on the shared `FocusZone`
primitive, the F6 region cycle + skip link, and the per-surface enrollments
(left rail, stage, right rail, timeline, overlays, kit). Verified against the
project rules `dashboard-layer-ownership`,
`keyboard-shortcuts-bind-through-the-one-keymap-registry`,
`every-composite-navigates-through-the-one-focuszone`,
`bounded-by-default-for-every-accumulator`, and `no-hardcoded-px-in-dom-styling`.
The full lint gate is green (the campaign's touched files pass eslint + prettier
+ tsc) and the campaign tests pass; a `vaultspec-code-reviewer` pass supplied the
findings below. Verdict: PASS-WITH-NITS — both HIGHs were fixed and re-verified
in the same session.

## Findings

- **HIGH (RESOLVED) — timeline viewport double-fire.** `onTimelineKeyDown` (the
  pan/zoom viewport) called `preventDefault` on its arrows/Home/End but not
  `stopPropagation`, so a pan ALSO bubbled to the one global keymap dispatcher
  (which binds the bare arrows to graph feature/neighbour cycling) — the exact
  Class-A/Class-B double-fire the campaign exists to prevent. Fixed by stopping
  every consumed key (and stopping ArrowUp/Down even though they are not pan
  verbs). Live-verified: focusing the viewport and pressing the arrows no longer
  triggers any graph selection.
- **HIGH (RESOLVED) — read-only viewers hijacked instead of scrolling.** The
  CodeViewer and MarkdownReader scroll regions were made focusable (`tabIndex 0`)
  for keyboard scrolling, but without an `onKeyDown` the scroll keys bubbled to
  the global dispatcher, which `preventDefault`ed them (blocking the very scroll
  the tab stop existed for) and walked the graph instead. Fixed with a shared
  `stopScrollKeyPropagation` helper that stops the scroll keys (without
  preventing default, so the browser scrolls natively); covered by a new unit
  test.
- **LOW (RESOLVED) — wider-than-needed type.** `CodeTree`'s `setActiveKey` was
  typed `(id: string | null) => void` while the FocusZone contract is
  `(key: string) => void`; narrowed to match.

## Recommendations

- The two HIGHs shared one root cause — a focusable surface that consumes or
  receives arrow keys without isolating them from the global bare-arrow bindings.
  This is precisely what the codified rule
  `every-composite-navigates-through-the-one-focuszone` already mandates; the
  review confirms the rule is correct and load-bearing, and that the gap was two
  surfaces that were focusable but had NOT yet been swept under it. No new rule
  is needed.
- Remaining enrollment gaps tracked in the plan (not regressions): the filter
  facet flyout (S12, a concurrently-edited surface) and the dockview tab strip
  (S18, library-owned) are keyboard-reachable but not yet roved into one tab stop.

## Codification candidates

None. The campaign already codified
`every-composite-navigates-through-the-one-focuszone`, and this review's findings
are instances that rule governs rather than a new durable lesson — confirming the
rule rather than extending it. An empty section here is the intended outcome.
