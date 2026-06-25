---
tags:
  - '#research'
  - '#state-mode-uniformity'
date: '2026-06-25'
modified: '2026-06-25'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace state-mode-uniformity with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `state-mode-uniformity` research: `uniform state-mode system across figma + frontend`

Every data-bearing surface in the dashboard can be in one of four modes — Typical,
Loading, Degraded, Empty. Today the treatment of the non-typical modes is INCONSISTENT
across surfaces, in both the binding Figma file (`SlhonORmySdoSMTQgDWw3w`) and the
frontend (`frontend/src/`): some loading states show text, vocabulary drifts
(unavailable / degraded / error), several surfaces miss modes entirely, and many
hand-roll ad-hoc classes/strings/glyphs instead of composing shared, theme-bound
primitives. This research grounds a campaign to make the four modes ONE uniform,
shared, themed system — designed in Figma as reusable components/variants AND
implemented in the frontend, with the two matching visually.

## The canonical standard (the target)

The rail components (`frontend/src/app/left/railStates.tsx`,
`frontend/src/app/right/railStates.tsx`) already embody the right treatment; it is
promoted here to the binding standard for EVERY surface:

- **Loading — UI ONLY, NO TEXT.** A skeleton that mimics the content's own rhythm
  (eyebrow + rows / cards), pulsing on `bg-paper-sunken`; the human label lives only in
  `sr-only` under `role="status" aria-busy`. Never a spinner-with-copy, never a
  "Loading…/Reading…/Searching…/unfolding…" sentence on screen.
- **Degraded — shared caution glyph + one plain sentence, stale tone.** The Lucide
  `TriangleAlert` (or the shared caution dot) in `text-state-stale`, plus ONE
  user-facing sentence in `text-ink-muted`; the honest "showing what loaded" variant is
  the compact inline notice. Never the raw tier/branch reason.
- **Empty — shared neutral glyph + one plain sentence.** A centered neutral glyph
  (`Folder`/check medallion) in `text-ink-faint` + one sentence in `text-ink-muted`.
- **Typical — the populated view.**

Cross-cutting laws: (1) every mode uses DESIGN TOKENS only — `text-state-stale`,
`text-ink-muted`, `text-ink-faint`, `bg-paper-sunken`, the shared pulse utility — never
a raw hex or a loose inline weight; (2) every glyph comes from the two sanctioned
families (Lucide chrome / Phosphor domain), shared, never an ad-hoc shape or a text
glyph; (3) ONE vocabulary — `loading` (in flight) / `degraded` (a backend TIER reports
down) / `empty` (no data) / `error`|`unavailable` (transport/capability failure) — used
identically everywhere; (4) the rendering composes a SHARED state-mode kit, never a
per-surface hand-roll.

## Audit: the violations (frontend)

The rails (Vault tree, Code tree root, Status-tab full body) are already centralized on
the shared rail states — these are the reference. The drift lives in the nested /
brokered / search surfaces:

- **Loading-has-text (the headline violation, ~10 sites):** `right/StatusTab.tsx` Open
  Plans / Open PRs / Open Issues / Recent Commits sections (pulsing TEXT label), 
  `right/PlanStepTree.tsx` ("unfolding plan…"), `right/ChangesOverview.tsx`,
  `right/Inspector.tsx` + `islands/NodeInterior.tsx` ("unfolding lifecycle…"),
  `palette/DocumentSearchSurface.tsx` ("Searching…"), `palette/SearchPaletteSurface.tsx`,
  `left/WorktreePicker.tsx` ("worktrees are loading…"), `left/CodeTree.tsx` child levels,
  `timeline/Timeline.tsx`, `stage/CanvasStateOverlay.tsx` ("Loading..." card text).
- **Ad-hoc / duplicated state classes:** each of the above derives its own
  `loadingClassName` / `unavailableClassName` / loose `animate-pulse-live text-…` instead
  of composing a shared primitive.
- **Vocabulary drift:** the right-rail GitHub sections say "unavailable"; the canvas +
  rails say "degraded"; the code tree says "error". No single mapping.
- **Missing modes:** Degraded is unrendered on the Timeline, Inspector, Node Interior,
  Code-tree child levels, and Worktree Picker.
- **Canvas internals not shared:** `stage/CanvasStateOverlay.tsx` has good
  `StateCard`/`CornerBanner`/`LoadingSkeleton` but they are internal — nested surfaces
  that need the same degraded/loading treatment cannot reuse them.

## Audit: the violations (Figma)

The binding file already has state boards — `Activity Rail — States` (727:2972,
Typical/Degraded/Loading instances), `Timeline — States` (728:7313), the generic
`EmptyState` (515:1000), and `LoadingState`/`DegradedState` nodes (741:34xx / 742:34xx) —
but they are (a) NOT a uniform variant set (states are scattered instances, not one
`State=Typical|Loading|Degraded|Empty` variant axis per component), (b) inconsistent
(the `LoadingState` 741:3477 renders near-blank — a stale/placeholder design), and (c)
not present on every surface component (most components have only their Typical frame;
the rail-state frames just added for parity — `RailSkeleton`/`RailDegradedNotice` — are
single frames, not variants). The goal requires each surface component to carry its
supported modes as a proper variant axis, all four non-typical treatments rendered
uniformly (loading = skeleton-no-text, etc.), bound to the same variables and the same
glyphs.

## Direction

One shared, theme-bound, shared-glyph state-mode kit, expressed BOTH as a Figma
variant system (a `State=` axis on every data-bearing component, with one uniform
Loading/Degraded/Empty treatment) AND as a frontend kit (the canonical
`Skeleton`/`StateMessage` primitives the rails already use, exported and adopted by
every surface), with the loading-has-text and vocabulary-drift violations corrected and
the missing modes filled — Figma and frontend kept visually identical.
