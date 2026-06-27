---
tags:
  - '#research'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-21'
related:
  - '[[2026-06-19-keyboard-action-system-adr]]'
  - '[[2026-06-19-keyboard-action-system-research]]'
---

# `keyboard-navigation` research: `full-frontend keyboard traversal architecture`

This research grounds a multi-wave campaign to make the entire dashboard frontend operable by
keyboard. The question is not "add some shortcuts" — the prior `keyboard-action-system` cycle
already built the command-shortcut layer — but the deeper one it deliberately deferred: can a
keyboard user actually *reach and traverse* every interactive element, region by region, the way
a pointer user can? The answer today is no. This document records a live diagnosis of the running
app, the industry-standard target model, an inventory of what already exists, and the precise
architectural gap, so the ADR can commit to a remedy and the plan can enroll every component
against it.

The investigation method was deliberately empirical, per the campaign directive: the running app
was driven through a real browser (Chrome over the DevTools protocol) with real key events, and
focus was observed after each press — not asserted in a unit test. Findings F2 are reproductions,
not inferences.

## Findings

### F1 — This is the Class-B / inter-region complement the command-shortcut cycle scoped out

The `keyboard-action-system` cycle drew a load-bearing line between two classes of key handling.
*Class A* — true command shortcuts — became a centralized, rebindable keymap registry resolving to
the existing `ActionDescriptor` plane, fired by one global dispatcher. *Class B* — widget-intrinsic
ARIA interaction (focus traps, dismiss-on-escape, roving-tabindex tree/tab/segment navigation,
menu/listbox cursoring) — was **explicitly left in components and out of registry scope**, on the
correct reasoning that the ARIA Authoring Practices fix those keys and that rebinding `ArrowDown`
inside a listbox would break the widget.

Crucially, that ADR listed "no-keyboard-trap on Tab, live-region announcements, instant
non-animated keyboard selection" as a **WCAG accessibility floor to be *preserved through* the
convergence** — i.e. it *assumed Class B and the tab ring already worked* and only undertook not to
regress them. The live diagnosis below shows that assumption is false: the tab ring is broken and
actively traps focus today. This campaign is therefore the missing half — it builds and verifies
the Class-B widget navigation, the inter-region focus traversal, and the focus-management spine
that the command-shortcut cycle stood on but never owned. It does **not** alter the Class-A keymap
registry; the one new global affordance it introduces (region cycling) is itself a Class-A command
and will land as a binding *in* that registry, honoring the established rule.

### F2 — Live diagnosis: the frontend is keyboard-unreachable past the left-rail header

Driving the running app (`2026-06-16-backend-hotpath-hardening` corpus, ~1067 documents loaded)
with real `Tab`/`Escape`/`F6` key events and reading `document.activeElement` after each press
produced a reproducible failure map:

- **No initial focus.** On load, `document.activeElement` is `<body>`. APG requires a visible
  focused element to always exist; the app starts with none.
- **A dev-only artifact is tab stop #1.** The first `Tab` lands on a development "degrade"
  crash-trigger button (the dev crash-zone bar), which has no keymap context and sits in no
  landmark. A dev affordance is polluting the production tab ring as its first stop.
- **The filter flyout is an unintentional keyboard trap — the dominant defect.** Tab stops 2–5
  move correctly through the left-rail header (worktree scope, add-project, collapse, the vault
  filter field). But focusing the filter field **auto-opens the FilterSidebar flyout**, and that
  non-modal popover injects roughly twenty facet inputs (KIND / doc-type / feature-tag / STATUS /
  HEALTH checkboxes) **inline into the tab order**. Thirty consecutive `Tab` presses never escaped
  it — focus cycled within the flyout's inputs (vertical positions wrapping 320→635→320). The vault
  tree, the Vault/Files toggle, the stage, the graph canvas, the right rail, and the timeline were
  **never reached**.
- **Escape ejects the user to nowhere.** Pressing `Escape` closes the flyout but drops
  `document.activeElement` back to `<body>` — focus is **not** restored to the filter field or any
  successor. The keyboard user is dumped out of the flow entirely, and the next `Tab` restarts the
  same trap from stop #1. There is no keyboard path into the rest of the app at all.
- **~1,100 tabbable elements in a flat order.** Even with the trap removed, the DOM exposes ~1,100
  sequentially tabbable elements. The timeline alone contributes ~1,000: it renders an `sr-only`
  accessible node list with one `<button>` per visible document (~1,000 of 1,067). A flat tab
  sequence of this size is unusable by construction — it would take ~1,000 presses to Tab across
  the timeline. This empirically refutes the "make everything a tab stop" model and mandates a
  two-tier region model where each composite is a single tab stop entered then arrowed within.
- **Landmarks exist but nothing cycles them.** The shell already exposes a real landmark structure
  (`<main>`, `nav` "scope rail", `nav` "vault browser", `nav` "Breadcrumb", `<header>`, two
  `<footer>`s, a `region` "timeline viewport", an `aside`, a `region` "activity"). But no mechanism
  moves focus between them: `F6`/`Shift+F6` do nothing, there is **no skip link**, and only three
  `data-keymap-context` zones are declared (`left-rail`, `canvas`, `right-rail`) — the timeline is
  not even a focus context. The regions are drawn but not connected.

The net effect matches the campaign's premise exactly: at the keyboard, "basically nothing works."

### F3 — The industry-standard target model (APG-grounded)

The W3C ARIA Authoring Practices establish the convention this app must adopt:

- **Two tiers of motion.** `Tab`/`Shift+Tab` move between *components* (the "tab sequence");
  arrow keys (plus `Home`/`End`, typeahead) move *within* a component that contains multiple
  focusable children. The rule is explicit: **only one focusable element per composite widget
  belongs in the tab sequence**; internal navigation happens via arrows after focus arrives.
- **Two focus-management techniques, chosen per widget.** *Roving tabindex* (the active child is
  `tabindex="0"`, the rest `tabindex="-1"`, and `.focus()` moves on arrow) — preferred for
  trees/lists/toolbars/tabs because the user agent scrolls the newly focused element into view.
  *`aria-activedescendant`* (DOM focus stays on the container; an attribute names the active child)
  — appropriate where the container must retain focus, notably comboboxes/searchboxes, which this
  app already uses for the command/search palettes.
- **Inter-pane traversal.** APG does not standardize multi-pane cycling, but the universal
  desktop/IDE convention (VS Code, Firefox, GNOME) is `F6`/`Shift+F6` to cycle major panes/regions,
  complemented by a "skip to content" link. For an application with this many always-visible panels
  it is not optional polish — it is the only ergonomic way to cross the shell.
- **Non-negotiable floors.** A visible focus indicator must *always* exist and be distinguishable;
  there must always be an active element (never `<body>`); focus must move in a predictable
  reading order grouped by region; there must be **no keyboard trap** except an intentional,
  escapable modal; and when an element holding focus is removed (a dialog closes, a row deletes),
  focus must be explicitly moved to a logical successor (focus restoration).

### F4 — Mature but disconnected primitives already exist (do not rebuild)

A full inventory of the frontend found substantial, correct machinery that is *present but not
wired into a coherent whole*:

- **Focus utilities:** a Tab-wrapping focus trap, a focus-capture-and-restore hook, and a
  DOM-derived roving-focus mover all exist as shared chrome utilities.
- **Bespoke roving implementations** in at least five places (the vault/files trees, the segmented
  toggle, the search-results list, the context-menu items) — each hand-rolled, with subtly
  different entry/exit semantics, not sharing one primitive.
- **Correct ARIA roles** on dialogs (`dialog`/`aria-modal`), context menus (`menu`/`menuitem`/
  `aria-activedescendant`), the palettes (`combobox`/`listbox`/`option`), tabs (`tab`/
  `aria-selected`), and segmented toggles (`radiogroup`/`radio`). Notably the trees are built from
  real `<button>`s with `aria-expanded`/`aria-current` rather than the `tree`/`treeitem` role
  contract — a defensible choice, but it means tree keyboard semantics are entirely hand-owned.
- **Focus-visible styling** on every kit primitive via the `outline-focus` token (no reliance on
  the default browser ring), and an **`aria-live` polite announce region** for navigation feedback.
- **The Class-A keymap registry + dispatcher** from the prior cycle, with `data-keymap-context`
  scoping and a registry-derived `?` legend.

The conclusion is decisive: the problem is **not missing primitives, it is missing connective
tissue**. The pieces are islands; nothing composes them into one continuous, enterable, escapable
flow.

### F5 — The architectural gap: the connective spine

Synthesizing F2–F4, the campaign must add (and verify) the layer that binds the existing islands:

1. **A single shared `FocusZone` primitive** that standardizes roving tabindex + arrow/Home/End
   handling + **entry memory** (re-entering a region returns to its last-focused child), replacing
   the five bespoke roving implementations so every composite behaves identically and contributes
   exactly one tab stop.
2. **A region/landmark traversal layer**: a curated ordered set of focus regions over the existing
   landmarks, with `F6`/`Shift+F6` cycling (registered as a *Class-A global binding* in the keymap
   registry, per the standing rule) and a "skip to content" link as the first tab stop.
3. **Consistent focus restoration** on every overlay close (the filter flyout, menus, dialogs,
   popovers) — never drop to `<body>`.
4. **Trap remediation**: the filter flyout must either become a proper escapable modal or stop
   auto-opening on focus and stop injecting itself inline into the tab order; the dev crash-bar must
   leave the production tab ring; the timeline's ~1,000-button `sr-only` list must be contained
   behind a single region entry rather than enumerated in the flat sequence.
5. **A canvas focus contract**: the `application`-role graph host is one tab stop with a documented
   in-canvas key model and a clean `Escape`/`Tab` exit back to the shell sequence.
6. **Guaranteed initial focus and an always-present visible indicator.**

### F6 — Boundaries and constraints the ADR must respect

- **Preserve the Class-A keymap registry.** No surface grows a private global `keydown` listener;
  the F6 region-cycle and skip-link activation are command affordances and bind through the one
  registry (`keyboard-shortcuts-bind-through-the-one-keymap-registry`). Within-region arrow
  navigation stays Class B in components.
- **Layer ownership.** The focus/region spine is shared substrate — it belongs in `platform`/
  `stores`/shared chrome, not duplicated per surface; `app`/`scene` surfaces consume it
  (`dashboard-layer-ownership`).
- **Bounded accumulators** for any retained focus history / region registry
  (`bounded-by-default-for-every-accumulator`), and **relative units only** for any new focus
  styling (`no-hardcoded-px-in-dom-styling`).
- **One-by-one enrollment.** The campaign directive requires every interactive React component to
  be brought onto the model individually and **live-verified** in the running app, not batch-claimed
  green. The foundation (F5.1–F5.2) lands first so the connective tissue exists before components
  enroll against it.

## Open questions for the ADR

- **Hand-roll `FocusZone` vs adopt a library.** The prior cycle's "no new runtime dependency,
  surface is small enough to own" reasoning argued for hand-rolling; a `FocusZone` is more involved
  than a chord parser. Decide between a small in-house primitive (consistent with precedent and the
  bespoke utilities already present) versus adopting a focus-management library
  (e.g. a headless a11y toolkit). Recommendation leans in-house to preserve precedent and avoid the
  published-wheel/footprint concerns, but the ADR must weigh maintenance cost.
- **Roving tabindex vs `aria-activedescendant` per widget kind.** Default to roving (auto-scroll
  benefit) for trees/lists/toolbars; keep `aria-activedescendant` for the existing comboboxes. The
  ADR should fix the per-kind mapping so enrollment is mechanical.
- **The 1,000-button timeline list.** Decide the contract: a single focusable timeline region with
  arrow/Home/End traversal over marks and an `aria-activedescendant` cursor, versus the current
  per-mark `sr-only` button enumeration. The flat enumeration cannot stay in the tab ring.
- **Region set and `F6` order.** Fix the canonical ordered region list (icon rail, left rail, stage
  document dock, graph canvas, right rail, timeline) and whether `F6` wraps; confirm `F6` does not
  collide with any reserved chord and whether a secondary chord (e.g. a numbered jump) is wanted.
- **Filter flyout disposition.** Decide modal-dialog vs inline-disclosure for the FilterSidebar —
  this is both an a11y fix and a UX call that touches `filtering-has-one-canonical-surface`.
