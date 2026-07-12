---
tags:
  - '#adr'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-06-22-mobile-responsive-layout-adr]]"
  - "[[2026-07-08-mobile-enrichment-adr]]"
  - '[[2026-07-12-mobile-unified-rail-research]]'
---

# `mobile-unified-rail` adr: `compact unified rail` | (**status:** `accepted`)

## Problem Statement

The compact shell's information architecture, decided in `mobile-responsive-layout`
D2 and shipped, shows ONE surface at a time under a bottom tab bar: Browse (the
left-rail vault/file tree), Status (the right-rail activity content), Timeline (the
scrubber minimode), and momentary Search. In `CompactAppShell.tsx` the `<main>`
renders exactly one of `LeftRail`, `StatusTab`, or `CompactTimeline`, selected by
`useCompactSurface()` and the `BottomTabBar`. Because Status is a peer TAB, a user
who lands on Browse never sees it — and Status carries the CRITICAL glanceable
state of the project: plan progress (done-of-total, tier), open GitHub PRs and
issues, the working-tree Changes fold, and recent-commit history. All of it hides
behind a tab-switch the user may never make.

This is the v3 pass in the mobile-layout line, and it is an IA reconsideration of
exactly one prior decision: v1 D2's mutually-exclusive tab-switched Browse/Status.
There is no dedicated research document; the grounding is the two prior ADRs and
the shipped compact code itself.

## Considerations

- **One shell projection, dumb chrome.** The layout is the single stores-derived
  projection `deriveShellFrameView` / `useShellFrameView` in
  `stores/view/shellLayout.ts`, driven by the `compact` flag from the
  `matchMedia`-backed `useViewportClass()` signal. The merge is a change to what
  the compact `main` RENDERS (both rails co-resident) — not a new shell, not a
  parallel mobile tree.
- **Zero engine or wire work.** Every Status item is already served (`/history`,
  `/prs`, `/issues`, recent commits bounded per the `status-overview` decision) and
  already projected through the stores hooks `StatusTab` consumes today. The
  wire-contract law — displayed state is backend-served — holds by construction.
- **A single scroll can get LONG.** Browse plus the full Status stack in one
  vertical surface needs section affordances: sticky section headers, collapsible
  folds, or an in-page jump — the exact treatment is a design-frame decision.
- **The filter authority is untouched.** The corpus filter stays authored in
  `app/left/`, presented through the existing filter bottom sheet; the unified
  surface is a pure consumer.
- **The graph canvas is untouched.** v1 D4 (graph not navigable on compact)
  stands; nothing here re-parents the portal-pinned canvas.
- **Guarded transitions are unchanged.** All navigation and close intents keep
  routing their existing unsaved-edit guards.
- **Touch floor.** Section headers, fold toggles, and any jump affordance honour
  the 2.75rem minimum target on the rem/token scale — no px literals.

## Considered options

(a) **Merge Browse and Status into ONE continuous vertical scroll main** — the
rails become co-resident vertical sections of one component — CHOSEN. (b) Keep the
tabs but add a persistent Status peek/summary strip above Browse — rejected:
partial by construction; the full status stack (Changes, PRs, issues, commits)
still hides behind the tab. (c) Make Status the landing tab instead of Browse —
rejected: only relocates the burial; the corpus tree becomes the hidden surface
instead. (d) A parallel compact component tree that stacks the two rails —
rejected: forks the one projection into a second mobile tree, violating
`responsive-layout-is-one-viewport-aware-projection`.

## Constraints

- **Design-first gate (blocking), inherited from v1/v2.** No code before the
  unified compact frame(s) are authored in the binding Figma file
  `SlhonORmySdoSMTQgDWw3w` and user-approved — section order, the long-scroll
  affordance, and the residual bottom tab bar all pinned in the frame. Re-run the
  no-context reviewer pass per the v1 audit discipline before routing for
  approval.
- **No new responsive library.** The `matchMedia`-backed viewport signal and the
  existing projection carry the change; no breakpoint framework enters.
- **Layer law.** View-layer only: no new fetch, no new client model, no raw
  `tiers`; stores hooks and the `SceneController` contract consumed unchanged;
  selectors return raw state and derive in `useMemo`.
- **Mature parent.** v1 and v2 are both delivered and closed; every primitive the
  unified surface composes (the rails, the bottom sheet, the tab bar, the compact
  reader) is shipped code. Nothing here is frontier.
- **No research document.** This is a directed decision grounded in the two
  sibling ADRs and the shipped compact code; the decision surface is narrow enough
  that the ADR itself is the record.

## Implementation

**D1 — One unified compact main.** The `compact` branch of `deriveShellFrameView`
emits a unified-rail frame, and `CompactAppShell`'s `<main>` renders the Browse
(`LeftRail`) content and the Status (`StatusTab`) content as stacked vertical
SECTIONS of one scroll region, instead of switching between them on
`useCompactSurface()`. Browse leads as the corpus landing, with Status following
as a co-resident section carrying a sticky section header and collapsible folds —
OR status is surfaced near the top as a summary; the exact section order and
long-scroll treatment are pinned by the Figma frame, not by this ADR. Both
sections keep consuming the same stores projections they consume today; the
merge is presentation only.

**D2 — The bottom tab bar narrows.** Browse and Status stop being separate tabs:
the bar reduces to the unified main plus Timeline (the minimode) and the momentary
Search — the exact residual bar is a design-frame decision. `compactSurface`'s
switching role narrows accordingly: it no longer arbitrates Browse versus Status,
which are co-resident; it keeps arbitrating whatever standing surfaces the
residual bar retains.

**D3 — Everything else stands.** The filter bottom sheet and the full-screen
search palette are unchanged; the sliding full-screen document reader (v1 D5) is
unchanged; v1 D2t (timeline minimode) and v1 D4 (graph not navigable) are
explicitly NOT revised. Only v1 D2's tab-switched Browse/Status IA is amended.

**D4 — The design gate is the first deliverable.** The unified frame(s) are
authored, no-context-reviewed, and user-approved before any code lands. Figma
remains binding; any code/frame disagreement resolves toward the frame.

The whole change is view-layer plus the one projection change — no engine change,
no new wire, no new model.

## Rationale

The status content is the critical, glanceable-on-a-phone information — the state
a user pulls the dashboard out of a pocket to check — and a tab-switch is exactly
the wrong disclosure for it: a standing fact hidden behind a momentary verb. This
is the same lesson v2 recorded as
`compact-surfaces-served-metadata-inline-never-hover-gated` — hover is not a
carrier on touch, and neither is a tab the user never taps; compact pays layout
for visibility. Since every Status item is already served and already projected,
the cheapest correct architecture is re-presentation through the existing seams:
one projection emits a unified frame, one shell renders two co-resident sections.
Merging inside the one projection keeps the
`responsive-layout-is-one-viewport-aware-projection` rule intact where every
rejected alternative either preserved the burial (b, c) or forked the tree (d).

## Consequences

- **Gains.** The critical status stack is always in reach on the form factor with
  the least room — glanceable by scrolling, never hidden behind a tab; one
  projection still serves both form factors; the compact IA gets simpler (fewer
  tabs, one main).
- **Costs.** The compact main becomes a longer scroll needing deliberate section
  management (sticky headers, folds, jump affordance); the tab bar's IA shifts and
  users must relearn where Status lives; design work to pin the unified frame
  precedes any code.
- **Pitfalls.** Forking a parallel compact tree instead of branching the one
  projection trips the projection rule; re-parenting the canvas blanks the graph;
  re-authoring the filter outside `app/left/` trips its guard; a freshly-minted
  per-render section view trips the stable-selector law.
- **Pathways.** Co-resident compact sections become a settled precedent for any
  future surface that must be glanceable rather than tab-gated; the section
  treatment is the natural seat for a future user "condensed" density preference.
