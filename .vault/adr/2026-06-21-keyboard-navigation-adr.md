---
tags:
  - '#adr'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-07-12'
related:
  - "[[2026-06-21-keyboard-navigation-research]]"
---

# `keyboard-navigation` adr: `two-tier region focus model with a shared FocusZone and F6 pane cycling` | (**status:** `accepted`)

## Problem Statement

The dashboard is not operable by keyboard. The research diagnosis — produced by driving the
running app with real key events — found that focus is trapped past the left-rail header: the
vault filter field auto-opens a non-modal flyout that injects ~20 inputs inline, ~30 `Tab` presses
never escape it, `Escape` drops focus to `<body>` with no restoration, and the stage, graph,
right rail, and timeline are never reachable. Underneath that headline trap the shell exposes
~1,100 flat tabbable elements (the timeline alone enumerates ~1,000 `sr-only` mark buttons),
starts with no focused element, has no skip link, and wires none of its real landmarks to any
pane-cycling mechanism (`F6` is dead).

The prior `keyboard-action-system` cycle built the command-shortcut layer (Class A: a rebindable
keymap registry over the `ActionDescriptor` plane) and **explicitly deferred** widget-intrinsic
navigation (Class B) and the inter-region focus spine, listing "no-keyboard-trap on Tab" as a
floor it assumed already held. It does not. This ADR fixes the architecture of the missing half —
the focus-management spine, the within-region widget navigation, and the cross-region traversal —
before any enrollment code lands, and binds it to the *existing* backend rather than a new one.

## Considerations

- **Two tiers of motion are mandatory (research F3).** Per the ARIA Authoring Practices,
  `Tab`/`Shift+Tab` move *between* composite widgets (one tab stop each) and arrow keys move
  *within* them. The ~1,100-element flat order (research F2) empirically rules out the
  "every element is a tab stop" alternative: it is unusable at this scale and fights the roving
  trees that already exist.
- **The primitives exist but are disconnected (research F4).** A focus trap, a focus-restore hook,
  a roving-focus mover, correct ARIA roles, focus-visible tokens, and an `aria-live` announce
  region are all present; five *bespoke* roving implementations diverge in entry/exit semantics.
  The work is connective tissue and standardization, not green-field.
- **Class A vs Class B must stay split (research F1).** The governing rule
  `keyboard-shortcuts-bind-through-the-one-keymap-registry` fixes this: command shortcuts live in
  the one registry; widget-intrinsic ARIA keys (arrows in a tree/menu/listbox) stay in components.
  Region cycling is a *command* and therefore belongs in the registry; within-region arrowing is
  Class B and stays in the new shared widget primitive.
- **Backend is consolidated, not extended.** Region-cycle persistence and any new command reuse
  the engine-owned `keybindings` setting and the `ActionDescriptor`/dispatcher plane shipped by the
  prior cycle. No new engine endpoint, no wire-shape change, no storage migration. The focus spine
  is pure frontend substrate. This satisfies the campaign's "backend consolidated" directive.
- **Library vs hand-roll for the widget primitive.** A focus-zone is more involved than the prior
  cycle's chord parser. Options weighed: adopt a headless a11y toolkit (e.g. react-aria
  `useFocusManager` / a `FocusZone`-style component) versus a small in-house primitive composed
  from the focus utilities already present. The precedent ("no new runtime dependency; own the
  small surface"), the existing utilities, and bundle/relative-unit control favor hand-rolling,
  accepting the maintenance cost.
- **Layer ownership (`dashboard-layer-ownership`).** The spine is shared substrate — it belongs in
  `platform`/`stores`/shared chrome; `app`/`scene` surfaces consume it and never grow a private
  global `keydown` listener.

## Constraints

- **Parent-feature stability.** The two seams this builds on are mature and shipped: the keymap
  registry + dispatcher (Class A) and the engine `keybindings` setting. The only additions are new
  registry *entries* (region-cycle commands) and a frontend focus-zone primitive — both additive,
  no break.
- **Accessibility floor must rise, not regress.** Existing operability (graph arrow-walk,
  live-region announcements, instant non-animated selection, focus-visible rings) is preserved;
  the no-keyboard-trap and always-have-focus floors that are currently *violated* are brought up to
  standard.
- **Bounded by default.** The region registry and any retained focus/entry-memory map carry
  explicit caps at creation (`bounded-by-default-for-every-accumulator`).
- **Relative units only.** Any new focus styling uses rem/token units; no hardcoded px
  (`no-hardcoded-px-in-dom-styling`).
- **One-by-one, live-verified enrollment.** Every interactive component is brought onto the model
  individually and verified by driving the running app with real key events — never batch-claimed
  green. The foundation lands before components enroll against it.

## Implementation

The design is six layers; the foundation (1–4) lands first, then surfaces enroll (6).

**1. The `FocusZone` widget primitive (`platform`/shared chrome).** One pure, reusable primitive
standardizes Class-B composite navigation: roving tabindex (active child `tabindex="0"`, siblings
`-1`), arrow / `Home` / `End` / typeahead movement, wrap policy, an orientation flag
(vertical/horizontal/grid), and **entry memory** (re-entering the zone restores its last-focused
child; the zone contributes exactly one tab stop). It composes the existing focus-mover and
focus-restore utilities rather than re-implementing them, and replaces the five bespoke roving
sites (trees, segmented toggle, search results, context-menu items) so every composite behaves
identically. Comboboxes (the palettes) keep `aria-activedescendant` and are *not* converted —
the primitive exposes both modes, defaulting to roving.

**2. The region traversal layer (`stores`/`platform` + one `app` mount).** A bounded, ordered
**focus-region registry** names the major panes over the existing landmarks — canonical order:
skip-link target → left rail → stage document dock → graph canvas → right rail → timeline (the
collapsed icon rail folds into the left-rail slot). `F6` advances and `Shift+F6` reverses focus to
the next/previous *visible* region, landing on that region's remembered child (or its first
focusable). These two affordances are registered as **global Class-A keybindings in the existing
keymap registry** (not a private listener), so they are rebindable and legend-derived like every
other command, and persist through the engine `keybindings` setting.

**3. Skip link + guaranteed initial focus.** A visually-hidden "skip to content" link is the first
tab stop, moving focus to the stage. On load, focus is programmatically placed on a sensible
first element (the skip link / main region) so `document.activeElement` is never `<body>` and a
visible indicator always exists.

**4. Focus-restoration discipline + trap remediation.** Every overlay restores focus to its trigger
on close and never drops to `<body>`: modal surfaces (dialogs, command/search palette) trap Tab and
restore; non-modal popovers (menus, the filter flyout) close on `Escape`/outside-click and restore.
Three concrete traps are remediated: (a) the **filter flyout** stops auto-opening on field focus and
becomes an explicit, contained disclosure that restores focus on dismiss — it is no longer injected
inline into the tab order; (b) the **dev crash/degrade bar** leaves the production tab ring; (c) the
**timeline's ~1,000-button `sr-only` list** collapses into a single focusable timeline region with an
`aria-activedescendant` cursor traversed by arrows / `Home` / `End`, instead of 1,000 tab stops.

**5. The canvas focus contract.** The graph host stays a single `application`-role tab stop with its
existing in-canvas key model (arrow-walk, open, expand — already Class-B/canvas-context); focus-in is
clean and `Escape`/`Tab` exit returns to the shell region sequence. `F6` treats the canvas as one
region.

**6. Per-surface, one-by-one enrollment.** With the foundation in place, each interactive component
is brought onto the model individually — left rail (worktree picker, filter field+flyout, browser
toggle, vault tree, files tree), stage (graph nav controls, settings panel, filter sidebar, dock
tabs, viewers), right rail (folds, list rows, step tree), timeline (mark cursor, controls, minimap),
menus + palettes, dialogs/settings, and the kit primitives they compose — each verified by a live
keyboard pass before it is marked done. A separate `reference` document will capture the `FocusZone`
API, the region-registry entry shape, and the roving-vs-activedescendant per-kind mapping as
code-level detail.

## Rationale

The research is decisive: the costly backend — a centralized, guardable command plane and an
engine-owned settings wire — already exists and is already consumed, so the F6 region-cycle binds
*into* it rather than spawning a parallel mechanism (consistent with
`keyboard-shortcuts-bind-through-the-one-keymap-registry` and `dashboard-layer-ownership`). The
two-tier model is not a preference but the APG standard, and the ~1,100-element flat order proves
the alternative is unusable. A single `FocusZone` replaces five drifting roving implementations,
making enrollment mechanical and behavior uniform — the same consolidation logic the design-system
and filter-consolidation cycles applied to their domains. Hand-rolling the primitive follows the
prior cycle's owned-small-surface precedent and keeps bundle and unit control; the maintenance cost
is bounded because the primitive is pure and composes utilities that already exist. Keeping Class B
in components respects the ARIA widget contracts and the existing accessibility floor.

## Consequences

- **Gains.** Every interactive element becomes reachable and operable by keyboard; one `FocusZone`
  governs all composite navigation; `F6`/skip-link cross the shell ergonomically; focus is never
  lost to `<body>`; the no-keyboard-trap and always-focused WCAG floors are met; region cycling is
  rebindable and legend-derived for free.
- **Costs / difficulties.** Converting five bespoke roving sites onto one primitive risks subtle
  per-widget regressions — each conversion must be live-verified, which is why enrollment is
  one-by-one. The timeline cursor rework (1,000 buttons → one activedescendant region) is the
  largest single change and touches the `sr-only` accessibility list. The filter-flyout disposition
  also touches `filtering-has-one-canonical-surface` and is a UX call, not only an a11y fix.
- **Pitfalls.** A surface re-growing a private global `keydown` listener for region/skip behavior
  would re-scatter the problem the keymap rule fences. An unbounded region/entry-memory map would
  reintroduce accumulator risk. Misclassifying a within-region arrow as a global command would
  break a widget (the standing Class A/B hazard).
- **Pathways opened.** A reusable focus-zone every future composite inherits; a region model a
  future "focus mode" or panel-management feature can build on; a genuinely accessible product
  surface (screen-reader traversal improves as a side effect of the landmark+region work).

## Codification candidates

- **Rule slug:** `every-composite-navigates-through-the-one-focuszone`.
  **Rule:** Every multi-child interactive composite (tree, list, toolbar, tab set, segmented
  control, menu, mark cursor) manages within-widget keyboard motion through the shared `FocusZone`
  primitive and contributes exactly one tab stop; no surface hand-rolls a private roving-tabindex or
  arrow-key handler, and inter-region traversal (`F6`/skip-link) is a Class-A binding in the keymap
  registry, never a private global listener.

  *(Promote only after it holds across at least one full enrollment cycle, per the codify
  discipline — named here as the durable constraint this decision introduces.)*
