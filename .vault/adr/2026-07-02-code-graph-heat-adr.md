---
tags:
  - '#adr'
  - '#code-graph-heat'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-code-timeline-range-adr]]"
  - "[[2026-06-14-graph-node-salience-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace code-graph-heat with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, superseded, or deprecated. A new ADR starts as proposed; it
     moves to accepted or rejected when the decision is made; it becomes
     superseded when a later ADR replaces it (set by vault adr supersede,
     which also records superseded_by); and deprecated when it is retired
     without a direct successor.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `code-graph-heat` adr: `recency heat node coloring` | (**status:** `accepted`)

## Problem Statement

The code file graph colors by module identity only (top-7 module hues, depth
lightness). The user directive asks for a RANKED, heatmap-like coloring driven by
the best per-node data, using theme colors with gradients between them. Two
decisions must be recorded: WHICH metric drives the rank (and where the rank is
computed), and HOW the ramp derives from the theme system without inventing
off-theme colors.

## Considerations

- `displayed-state-is-backend-served`: a ranking is a classification; the rank
  must be an engine projection over the FULL pre-truncation node set, never a
  client re-derivation over the capped slice.
- The salience precedent (`graph-node-salience` ADR): rankings are engine-computed
  families; salience already drives node SIZE, so color is the free channel and a
  degree-driven color would double-encode connectivity.
- `dates.modified` (worktree mtime) now exists on every code file node
  (code-timeline-range ADR) — universally present, meaning "recently worked on",
  and the SAME axis the timeline range narrows, so color and filter tell one
  story.
- The scene bakes literal-hex theme tokens into GL at build; node colors re-bake
  only via set-data or `rebuildGLResources()` (the refresh-theme path). The one
  color mixer is the tested sRGB `mixHexToward`, already used for the depth
  gradient. No ramp token set exists; the design system allows one muted accent.
- Filter-vs-presentation: a color mode changes how the SAME corpus renders — a
  view/appearance parameter, never a `dashboardState.filters` facet.

## Considered options

- **A — recency rank (mtime percentile), engine-served, two-stop theme ramp.**
  Serve `recency_rank` 0..1 per code node (files: own percentile over all code
  files; modules: max over descendant files; undated: honestly absent). Scene
  gains `nodeColorMode: category | recency` (the `edgeColorMode` pattern); heat
  color = `mixHexToward(cold, accent, rank)` with cold = the ink-muted neutral
  receded toward canvas (the theme's own recede idiom). CHOSEN.
- **B — import-degree rank.** Rejected: degree already drives size via salience;
  double-encodes architecture and says nothing about activity.
- **C — file-size rank.** Rejected: not served, weak semantics for the primary
  color axis.
- **D — client-derived rank from the served mtimes.** Rejected outright: the
  slice is node-capped, so a client rank is computed over a truncated set and
  silently wrong (`displayed-state-is-backend-served`).
- **E — a dedicated multi-stop heat token set (new `--color-scene-heat-*` tier).**
  Deferred: a two-stop ramp between EXISTING theme roles needs no new tokens and
  cannot drift off-theme; a bespoke multi-hue heat scale would fight the
  one-accent warmth discipline. Recorded as the upgrade if two stops prove too
  flat.

## Constraints

- Parent stability: the mtime pipeline (code-timeline-range ADR) and the code
  module-hue viz wire (CGR-005) are fresh but gate-tested; the `SceneController`
  seam is untouched (an appearance param rides the existing
  `set-appearance-params` command).
- The rank computation must stay a bounded per-generation projection (one sort
  over file nodes), mirroring `module_hues`' full-graph discipline so color
  identity is stable under narrowing.
- Scene-read colors must remain literal-hex token reads; the ramp interpolates
  BETWEEN two token-derived colors at build time (no `var()` chains into GL).
- Labels are user-facing: the control says Node color / Category / Recency;
  `recency_rank` stays wire-internal.

## Implementation

- **Engine**: a `recency_ranks` projection in the code query module — sort all
  dated `CodeArtifact` mtimes, percentile-rank each file (single file = 1.0),
  propagate the max to ancestor modules; annotate `recency_rank` (3 dp) onto both
  granularities' node views. Computed over the full graph, narrowed slices echo
  the same rank.
- **Frontend wire**: the scene mapping carries `recency_rank` →
  `SceneNodeData.recencyRank`.
- **Scene**: `AppearanceParams.nodeColorMode` (`category` | `recency`, default
  category, schema-declared with ui+lab exposure). `nodeColorNumber` in recency
  mode maps a ranked node to `mixHexToward(cold, accentColor(), rank)` where
  cold = `mixHexToward(inkMutedColor(), canvasBackground(), 0.35)`; a node with
  no rank renders the cold end (reads as "not recently touched"). A mode change
  routes through `rebuildGLResources()` — the proven refresh-theme rebuild — so
  node colors, edge end-colors, glyph inks, and the minimap re-bake consistently
  with layout preserved.
- **Chrome**: the graph controls render the enum as a SegmentedToggle (the
  edgeColorMode pattern); values persist via the existing `graph_controls`
  setting. The code legend adds an Older → Recent gradient ramp row (CSS
  `color-mix` over the SAME two token roles) when recency mode is active, in
  place of the module swatch key.

## Rationale

Recency is the only candidate that is universally present, engine-served, and
semantically aligned with what a heat map over a codebase means — where the work
is. Rank (percentile) rather than linear age is the robust heat mapping: mtimes
cluster heavily (a checkout day, a big campaign), and a linear scale would
collapse most nodes onto one end while a rank spreads the gradient evenly.
Serving the rank keeps the client honest under the node ceiling. The two-stop
theme ramp (receded neutral → the one accent) expresses "cold structure, hot
activity" entirely inside the existing token vocabulary and the existing tested
mixer, and the rebuild path is the same one theme flips already exercise — no new
GL machinery, no new token tier, no seam change.

## Consequences

- The code graph gains an activity heat view: recently-touched files (and the
  modules sheltering them) glow toward the accent; cold structure recedes —
  consistent across themes because both stops are theme tokens.
- Recency color + timeline range narrow on the same axis, so the two affordances
  compose: narrow to a window, see the gradient within it.
- mtime is worktree-local (a fresh checkout compresses ranks toward uniform
  recency) — same recorded trade-off as the timeline range; the git-time upgrade
  path covers both.
- Vault nodes are untouched in v1 (no served rank), though the scene mapping is
  corpus-agnostic: serving a vault recency rank later lights the same mode up
  for documents with no further scene work.
- A mode toggle costs one GL rebuild (the refresh-theme cost) — acceptable for a
  rare, deliberate switch.
