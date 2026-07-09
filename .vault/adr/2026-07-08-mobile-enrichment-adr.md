---
tags:
  - '#adr'
  - '#mobile-enrichment'
date: '2026-07-08'
modified: '2026-07-08'
related:
  - '[[2026-06-22-mobile-responsive-layout-research]]'
  - '[[2026-06-22-mobile-responsive-layout-adr]]'
  - '[[2026-06-23-mobile-responsive-layout-plan]]'
  - '[[2026-06-22-mobile-responsive-layout-audit]]'
---

# `mobile-enrichment` adr: `compact dashboard enrichment` | (**status:** `accepted`)

## Problem Statement

The delivered `mobile-responsive-layout` v1 made the compact shell a deliberately
reduced surface: one pane under a bottom tab bar, a sliding full-screen reader, a
scrubber-only timeline, no navigable graph. That reduction shipped and closed; this
ADR is the v2 enrichment pass restoring capabilities the reduction cut too deep.
Four gaps, each verified in code:

1. **No workspace switching.** `CompactAppShell.tsx` renders the worktree as STATIC
   title text in `MobileTopBar` (the last path segment of the active scope). The
   desktop `WorktreePicker` (Recent, this project's worktrees, Projects, Add a
   project) has no compact counterpart, so a phone user can see where they are
   but cannot move.
2. **Served metadata is hover-gated, and touch has no hover.** A vault-tree row
   shows its title, the plan pip / ADR acceptance mark, and ONE meta value (the
   sort-key date) inline, per the desktop 16rem row-density law. Everything else
   the wire already serves (path, the three date semantics, size, plan tier, the
   plain-language ADR status word) rides the row tooltip. On a touch device the
   tooltip never fires, so this served metadata is invisible on the exact form
   factor with the least room to discover it elsewhere.
3. **Reader wayfinding is flattened.** Correction to the briefed gap: the compact
   markdown reader ALREADY shows date, reading time, and status (the shared
   editorial header inside `MarkdownReader`) and feature tags in its footer; the
   metadata is not missing from the open document. The verified residual is the
   breadcrumb: `CompactDocReader.tsx` hand-builds a bare two-item trail (Vault,
   title) while the desktop `DocPanel` derives the canonical three-item
   Vault / doc-type / title trail — a needless wayfinding downgrade and a
   duplicated derivation that has already drifted.
4. **Back navigation is half-built.** Tap-back exists (`MobileTopBar` back control
   firing the shared `closeDocTab` intent), but the edge-swipe back gesture that
   v1 ADR D5 promised was never implemented — no touch/pointer handler exists
   anywhere in `app/shell/`. Browse itself is a tree (expand/collapse), with no
   push/pop history.

This ADR decides the enrichment architecture for the four gaps. It inherits v1's
HARD design-first gate: the affected compact frames are authored in the binding
Figma file and user-approved before any code.

## Considerations

- **Every gap is presentation over already-served data.** The worktree map,
  vault-tree progress/status/dates/tier, and document frontmatter are all served
  and already projected through stores hooks (`useWorktreePickerView`, the
  vault-tree query, `useDockDocPanelView`). Zero engine or wire work; the
  wire-contract rule (displayed state is backend-served) is satisfied by
  construction.
- **The switching intents are already a projection.** `useWorktreePickerView`
  exposes rows plus `activateRow` / `activateRecent` / `swapProject`, and every
  activation path already routes `guardUnsavedDiscard`. Compact needs only a
  touch PRESENTATION of that one projection — exactly the v1 D3 precedent, where
  the filter stayed authored in `app/left/` and gained a bottom-sheet skin.
- **The compact overlay idiom already exists in both worlds.** `BottomSheet` /
  `SheetHandle` are shipped code (`app/chrome/BottomSheet.tsx`, used by the
  filter sheet) and shipped Figma kit components (v1 audit GAP S2 closure).
- **The one tree already branches on viewport class.** `TreeBrowser` consumes
  `useViewportClass()` today (compact tap-opens-leaf), so a viewport-conditional
  ROW treatment lives inside the same component — no parallel mobile tree, per
  the v1 candidate rule `responsive-layout-is-one-viewport-aware-projection`.
- **Hover is not a carrier on compact.** The row-density law (one inline meta,
  rest on tooltip) is a desktop law justified by hover existing. The compact
  correction is to trade row density for inline visibility, not to invent a new
  disclosure surface.
- **The reader header system is settled.** `DocChrome` (trail + View/Edit) plus
  the editorial header REPLACED the old stacked `DocHeader` crown
  (editor-figma-parity); enrichment must not resurrect the retired crown.
- **Two action planes for "back".** Per the actions/keymap rule: the back VERB is
  the shared `closeDocTab` intent (chrome affordance); an edge-swipe GESTURE is
  Class-B widget-intrinsic and stays inside the reader component — never a global
  listener, never a keymap-registry entry.
- **v1 D4 stands.** The graph remains non-navigable on compact; nothing here
  touches the portal-pinned canvas.

## Considered options

**Gap 1 — switcher presentation.** (a) Bottom sheet opened from the top-bar
identity trigger, presenting the SAME picker projection — CHOSEN. (b) Reuse the
desktop `WorktreePicker` popover as-is — rejected: a hover/pointer dropdown idiom
with sub-44pt rows overflowing a 390px viewport. (c) A fifth bottom tab —
rejected: switching is a momentary verb, not a standing surface, and the tab bar
is capped at its designed four. (d) Command-palette-only — rejected as the sole
path (undiscoverable for the primary "where am I pointed" control); the palette
plane remains in parallel.

**Gap 2 — metadata on touch rows.** (a) A second inline meta line on compact rows
(date + plain-language status), same `TreeBrowser`, keyed on the existing
viewport-class branch — CHOSEN. (b) Long-press metadata card — rejected as the
primary path: a hidden affordance that collides with the long-press context-menu
path. (c) A per-row info disclosure — rejected: steals tap width and adds a
second hop for facts a list exists to show.

**Gap 3 — reader wayfinding.** (a) Hoist the desktop trail derivation
(Vault / doc-type / title) into one shared helper consumed by both `DocPanel` and
`CompactDocReader` — CHOSEN. (b) Mount the retired `DocHeader` crown on compact —
rejected: resurrects a superseded header system beside the editorial header.
(c) A compact-only header component — rejected: forks a second header model for
data the shared editorial header already renders.

**Gap 4 — back interaction model.** (a) Widget-intrinsic edge-swipe inside
`CompactDocReader` firing the same guarded close intent as tap-back; Browse stays
a tree — CHOSEN. (b) A global gesture/history router layer — rejected: a private
global listener the actions rule forbids, for one consumer. (c) Push/pop history
on Browse — rejected: forks a second navigation model over a tree that already
navigates by expand/collapse; v1 D5 scoped the slide-stack to documents, and that
scoping held up in use.

## Constraints

- **Design-first gate (blocking).** No code before the affected compact frames are
  authored in the binding file `SlhonORmySdoSMTQgDWw3w` and user-approved: a NEW
  Workspace-switcher sheet frame (composing `BottomSheet` + `SheetHandle` + the
  row idiom), a REVISED Browse frame (two-line row metadata treatment), and a
  REVISED Reader frame (canonical trail; the edge-swipe direction, threshold, and
  follow-finger behaviour annotated). Re-run the no-context reviewer pass per the
  v1 audit discipline before routing for approval.
- **Mature parent.** v1 is delivered and closed (all plan steps checked; the
  mobile kit primitives exist in code and Figma). Nothing here is frontier.
- **Touch floor.** Every new affordance (sheet rows, identity trigger, swipe
  start band) honours the 2.75rem minimum target and safe-area insets on the
  rem/token scale; the denser two-line row must not sink below the floor.
- **Layer law.** View-layer only: no new fetch, no new client model, no raw
  `tiers`, stores hooks and the `SceneController` contract consumed unchanged.
  Selectors return raw state; row/sheet views derive in `useMemo`.
- **Guarded close everywhere.** Every back path — tap and swipe — routes the same
  unsaved-edit-guarded close used today; the gesture may not bypass the guard.

## Implementation

**D1 — Workspace switcher as a compact bottom sheet off the top-bar identity.**
The Browse top-bar title (the short worktree name) becomes an interactive
identity trigger (name + chevron, one 2.75rem-plus target) opening a bottom sheet
in `app/shell/` that composes the existing `BottomSheet` and presents the SAME
`useWorktreePickerView` projection the desktop picker renders: Add a project,
Recent, this project's worktrees (with the degraded/no-vault row states), and
Projects. Selection routes the existing `activateRow` / `activateRecent` /
`swapProject` intents through `guardUnsavedDiscard`, dismisses the sheet, and
lets the accepted session transition drive the wholesale reset exactly as on
desktop. The desktop `WorktreePicker` is untouched; both are skins of the one
projection. No new fetch, no new model, no re-authoring of the switch semantics.

**D2 — Compact rows surface served metadata inline (revises the row-density law
for touch).** On compact, the vault-tree document rows — inside the SAME
`TreeBrowser`, branched on the `useViewportClass()` signal it already consumes —
render a second meta line carrying the served facts the desktop tooltip gates:
the document date and the plain-language status (ADR acceptance word; plan
done-of-total with tier). The existing inline marks (plan pip, ADR shape mark,
doc-type mark) stay. Path and byte/word size stay OFF the compact row (low
decision value in a phone list; the reader carries them); the desktop one-meta +
tooltip law is unchanged on regular viewports. All values flow from the existing
vault-tree presentation helpers in `vaultRowPresentation.ts` — nothing is
re-derived client-side.

**D3 — One shared reader trail derivation.** The Vault / doc-type / title
breadcrumb derivation currently private to the desktop `DocPanel` is hoisted to
one shared helper over the preserved stores header model, consumed by both
`DocPanel` and `CompactDocReader`, retiring the compact hand-built two-item
trail. The shared editorial header remains the ONE metadata carrier for the open
document (date, reading time, status, feature tags) — no `DocHeader`
resurrection, no compact-only header fork. The code viewer keeps its basename
title: a code document carries no served frontmatter, and honest absence beats a
fabricated header.

**D4 — Back verb + edge-swipe gesture, on their two sanctioned planes.** The back
VERB stays the shared guarded `closeDocTab` intent; the `MobileTopBar` back
control keeps firing it. The edge-swipe gesture is implemented as Class-B
widget-intrinsic pointer handling INSIDE `CompactDocReader`: a start band on the
leading edge, a horizontal-intent threshold that yields to vertical scrolling,
firing the SAME guarded close on commit — one verb, two affordances, zero new
action surfaces, no global listener, no keymap enrolment. Browse stays a tree:
no push/pop history is added over expand/collapse. The open-docs collection
remains the reader's history (back pops to the previous open document, then to
the pane), preserving v1 D5's model. Exact gesture direction, follow-finger
animation, and cancel behaviour are pinned by the revised Reader frame (D5 gate).

**D5 — The design gate is the first deliverable.** The three frame work items in
Constraints are authored, no-context-reviewed, and user-approved before any of
D1–D4 lands in code. Figma remains binding; any code/frame disagreement resolves
toward the frame.

v1 D2 (compact IA), D2t (timeline minimode), and D4 (graph not navigable) are
explicitly NOT revised by this ADR.

## Rationale

All four gaps sit strictly in the presentation layer over data the engine already
serves and the stores already project, so the cheapest correct architecture is
re-presentation through existing seams — the same shape v1 chose for the filter
(authored once, skinned per form factor), now applied to the worktree picker
(D1) and the reader trail (D3). D2 follows from the one honest observation that
makes this ADR necessary: the desktop density law delegates to hover, and hover
does not exist on touch, so compact must pay row height for inline visibility
rather than invent a hidden disclosure. D4 resolves the half-implemented state by
finishing v1 D5's promise on the plane the actions rule assigns to gestures
(widget-intrinsic), while declining the tempting over-build (a history router,
Browse push/pop) that would fork navigation models. The gap-3 correction (the
reader already shows its metadata through `MarkdownReader`'s editorial
projection) narrowed that decision to the trail and is recorded here so the plan
does not re-solve a solved problem.

## Consequences

- **Gains.** Compact becomes location-aware and switchable; served status and
  dates become visible on the form factor that most needs glanceability; the
  reader gains the canonical trail and the promised swipe; one trail derivation
  and one picker projection serve both form factors.
- **Costs.** Compact Browse rows get taller (fewer rows per screen) — the
  deliberate price of inline metadata; the switcher sheet adds one more compact
  overlay to keep coherent with the filter sheet (the shared primitive
  mitigates); the swipe gesture needs real-device verification (scroll-intent
  yielding, safe-area interplay) that the vitest wire suite cannot exercise.
- **Pitfalls.** Re-authoring picker semantics in the sheet instead of consuming
  the projection would fork the switch path (the D1 red line); deriving row
  status client-side instead of reading the served facts would violate the wire
  contract; a swipe that bypasses the unsaved-edit guard would eat drafts; a
  freshly-minted per-render row view would trip the stable-selector law.
- **Pathways.** The identity-trigger + sheet pattern generalizes to future
  compact chrome verbs (e.g. a compact settings entry); the inline-metadata
  treatment gives any future compact list surface (search results, status rows)
  a settled precedent; the shared trail helper is the natural home for future
  breadcrumb navigation (tappable crumbs).

## Codification candidates

- **Rule slug:** `compact-surfaces-served-metadata-inline-never-hover-gated`.
  **Rule:** On compact/touch viewports, any served metadatum whose desktop
  presentation is hover-gated (tooltip, hover card, title attribute) must have an
  inline or explicitly-tappable presentation on the surfaces where it bears a
  decision; hover is never the sole carrier on a touch form factor.
  *(Candidate only — promote per the codify discipline after it holds across this
  feature's execution cycle, alongside v1's two standing candidates.)*
