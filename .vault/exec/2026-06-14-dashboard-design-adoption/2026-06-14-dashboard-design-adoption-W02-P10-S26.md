---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S26'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Re-skin the canvas controls to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app/stage/AlgorithmPanel.tsx`

## Description

Re-skinned and gap-filled the six on-stage node-canvas controls onto the new OKLCH
token layer, Lucide structural chrome, and the sanctioned domain-mark registry per
the accepted canvas-controls surface ADR. The plan Step names only the algorithm
panel, but the ADR scope-fences the family as six components; all six were adopted.

Per-ADR React element inventory, each mapped to existing JSX (re-skinned in place)
or NEW:

- Tier dial: four tier toggles in fixed product order (declared, structural,
  temporal, semantic) — EXISTING, re-skinned. The literal Unicode glyphs
  (diamond, square, clock, wave) were replaced by the shared registry tier marks
  (the same silhouette source the canvas texture seam consumes); identity is now
  carried by mark SHAPE first with hue as redundant reinforcement, so the dial
  reads in grayscale. Per-tier confidence-floor sliders on temporal/semantic —
  EXISTING, now with a tabular-numeral readout and an aria-valuetext. Time-travel
  semantic-inapplicable designed state — EXISTING, preserved with a non-color
  data-state cue. Semantic-OFFLINE (rag down) designed state — NEW, derived
  through the existing graph-slice availability stores selector, never the raw
  tiers block.
- Filter bar: sidebar toggle — EXISTING, the literal box glyph replaced by a
  Lucide panel mark. Facet chips (type/feature/relation/status) — EXISTING,
  re-skinned with focus-visible. Loading state (strip without chips) — NEW. Text
  match, read-only date-range chip, hidden-count cost chip — EXISTING, the
  data-bearing chips now tabular.
- Filter sidebar: grouped collapsible sections with per-value toggles — EXISTING,
  re-skinned. Tier section now renders the shared registry marks. Loading-vs-empty
  distinction in the facet lists ("loading…" vs "none in corpus") — NEW.
  Reset-all, Escape-close, dialog focus management — EXISTING, preserved.
- Working-set breadcrumb: removable expansion chips, clear-to-constellation,
  keyboard E/Backspace — EXISTING, re-skinned with a Lucide remove mark and
  focus-visible. Tabular working-set size readout — NEW. Hides when empty —
  EXISTING.
- Algorithm panel: force/circular mode toggle, FA2 sliders, reset, Barnes-Hut —
  EXISTING, re-skinned. Slider readouts moved off the monospace identity face
  onto tabular numerals; accent moved to the muted-accent token; Escape-close
  added; focus-visible on every control. The SceneController command boundary was
  untouched.
- Discover: discover affordance, quarantined candidate list with score and
  question-mark-qualified mark, pin/unpin session state — EXISTING, re-skinned.
  The ad-hoc violet/white palette was replaced by the semantic-tier token and the
  muted-accent system; the literal wave glyphs replaced by the sanctioned semantic
  tier mark plus a Lucide help qualifier; loading liveness cue, empty, and
  discover-OFFLINE designed states realized; the close/remove glyphs replaced by
  Lucide marks.

Consumed only the public token surface (paper / ink / rule / tier / state / accent
/ focus, the spacing/radius/motion scales) — no hardcoded hex or px. Honored layer
ownership throughout: the controls read filter/view state through stores selectors
and the vocabulary hook, emit intent into the view store, and dispatch layout
through the SceneController command seam; none fetch the engine or read the raw
tiers block.

Added a real render test exercising the controls through the live stores client
transport (the mock engine, no component-internal doubles): the tier dial's four
role=switch toggles in product order each carrying their domain mark, the
non-color active cue, the tabular confidence readout, the time-travel-inapplicable
and rag-down-offline designed states (the latter driven by a real served tiers
block read through the stores selector), the filter bar's labelled pressed-state
sidebar toggle and tabular cost chip, the working-set tabular size readout plus
add/remove/clear and the E/Backspace keyboard path, and the discover affordance's
sanctioned mark plus its offline designed state.

## Outcome

All six controls re-skinned onto the token layer and sanctioned marks; every ADR
state realized; full lint gate green (eslint + prettier + tsc, exit 0); the new
render test passes 13/13 and the full frontend suite passes 690 with the
pre-existing 9 skips unchanged.

## Notes

One ADR-named structural change was deliberately NOT performed and is reported as a
follow-up: relocating the discover fetch out of the app-layer query into a stores
query hook. That relocation lives in the stores wire-client module, which a
concurrent execution slot owns this cycle; editing it was out of bounds. The
Discover panel was fully re-skinned and every designed state realized, but its
fetch still runs in the app layer behind the existing query — the single-wire-client
boundary correction the ADR mandates is left for the slot that owns the stores
queries module, with a code comment marking the seam.

No canvas-controls ADR insufficiency surfaced: the spec's element-by-element scope
and its ownership map were sufficient to execute the family against. The only seam
the ADR calls out as real work (the discover relocation) is exactly the one blocked
by concurrent file ownership, not by any spec gap.

## Revision (review PASS-WITH-REVISIONS, post-6ff4b9c)

Independent review of the initial commit returned PASS-WITH-REVISIONS; the stores
wire-client lane was freed this slot and the items landed:

- MEDIUM (the deferred relocation, now unblocked): moved the discover wire read
  out of the app layer into the stores layer. Added an `engineKeys.discover(id)`
  cache key, a pure `deriveDiscoverView(data, error, loading, enabled)` that maps
  the response to a loading / offline / candidates view (rag-down via a
  tiers-bearing 502, a tiers-less transport fault on the discover route, or a
  success envelope marking the semantic tier unavailable all collapse to the
  designed offline state), and a `useDiscover(nodeId)` hook wrapping the existing
  discover call with `retry:false` and `enabled` only when a node is open. The
  Discover panel now consumes `useDiscover` and no longer imports or calls the
  engine client — chrome no longer fetches, closing the layer-ownership deviation
  so stores is the sole wire client. Added seven `deriveDiscoverView` unit tests
  covering the closed/loading/served/offline/empty branches.
- LOW: bumped the tier marks in the tier dial and the filter sidebar tier section
  to size 14 to meet the iconography ADR's named 14px grayscale gate.
- LOW: gave the Discover dialog an Escape→close handler and self-focus on open,
  matching the filter sidebar and layout panel (kept `role="dialog"`); added a
  render test asserting the open→Escape→closed cycle.
- ACCEPT (no change): kept the `state-stale` token for the rag-down/offline copy,
  consistent with the tier dial's offline treatment; no new token introduced.

Re-gated: full lint gate green (eslint + prettier + tsc, exit 0); the full
frontend suite passes with the pre-existing 9 skips unchanged.
