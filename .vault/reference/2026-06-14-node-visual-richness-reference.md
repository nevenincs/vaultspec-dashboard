---
tags:
  - '#reference'
  - '#node-visual-richness'
date: '2026-06-14'
modified: '2026-06-15'
related:
  - '[[2026-06-14-node-visual-richness-adr]]'
  - '[[2026-06-14-node-visual-richness-research]]'
  - '[[2026-06-14-node-visual-richness-plan]]'
  - '[[2026-06-14-dashboard-node-canvas-adr]]'
  - '[[2026-06-14-dashboard-iconography-adr]]'
---

# `node-visual-richness` reference: `status-stamp and hover-card implementation spec`

The concrete implementation reference for the node-visual-richness feature: the
exact status vocabulary, the class-to-treatment geometry, the new marks, the
tokens, and the hover-card anatomy and motion. It grounds the plan's P03 (scene
stamp) and P04 (hover card) and the collision-free prototype built while the
build is gated. It names net-new modules (which can be authored now in isolation)
versus the small wiring edits into shared files (deferred to post-merge to avoid
colliding with the in-flight representation work).

## Status vocabulary and the class projection

The engine projects two additive node fields. `status_value` is the literal
type-specific status; `status_class` is the closed treatment-family enum the
renderer maps to exactly one stamp. The per-type mapping:

| doc_type | status_value source | status_value examples | status_class |
| --- | --- | --- | --- |
| adr | H1 status token | `proposed` | `provisional` |
| adr | H1 status token | `accepted` | `affirmed` |
| adr | H1 status token | `rejected` | `negated` |
| adr | H1 status token | `deprecated` | `retired` |
| plan | frontmatter `tier` | `L1`..`L4` | `tiered` (carries ordinal 1..4) |
| plan | checkbox aggregate | `done/total` | `progress` (the rollout arc; orthogonal to tier) |
| audit | worst finding heading | `critical`/`high`/`medium`/`low` | `graded` (carries ordinal 4..1) |
| rule | active vs superseded | `active` | `affirmed` |
| rule | active vs superseded | `superseded` | `retired` + `negated` (ghost + slash) |
| feature | in-flight vs archived | `in_flight` | `affirmed` |
| feature | in-flight vs archived | `archived` | `retired` |
| (any) | unparseable / predates convention | absent | absent (no stamp) |

The closed `status_class` enum is exactly: `affirmed`, `provisional`, `negated`,
`retired`, `graded`, `tiered`. The engine owns the type-to-class mapping (it
already owns the doc-type knowledge in the ontology module); the scene owns the
class-to-treatment mapping. The view never re-derives status from `doc_type`.

## Class to treatment (the rule of one)

One treatment per node at field LOD, grayscale-legible, color reinforcing only:

- `affirmed` - a solid 1px outline ring just outside the silhouette.
- `provisional` - a dashed outline ring (dash/gap roughly 3/2 in stamp units;
  never dotted - dotted collides with dashed at 14px).
- `negated` - a single bold diagonal slash across the silhouette (one stroke,
  ~2px at base radius; thin strikes vanish, so it is bold and single).
- `retired` - a luminance ghost: the sprite fill drops to the archived/muted
  token and the silhouette alpha drops to the ghost floor; no ring.
- `retired + negated` (superseded rule) - ghost plus the bold slash.
- `graded` - a single severity dot at the 4-5 o'clock position whose FILL PATTERN
  encodes the level: hollow (low), quarter, half, solid (critical). Level, not
  count, carries - one dot always.
- `tiered` - a four-step notch/stepped-fill arc at the 7-8 o'clock position; the
  filled-step count is the tier (L1=1 .. L4=4). The literal "L3" text appears
  only in the hover card, never on the field mark.
- `progress` (plan rollout) - the existing parametric progress ring arc
  (done/total), retained unchanged and drawn concentric with any outline ring.

LOD discipline: at far LOD the field shows only the coarsest stamp that reads at
overview scale - the ring style, the ghost, the slash. The graded dot's exact
fill level and the tiered notch's exact step count unfold at near LOD and on
focus, matching the existing anatomy far/near switch.

## New marks (collision-free, author in the mark inventory)

Only two genuinely new MARKS are needed; the ring/slash/ghost are sprite/anatomy
primitives, not marks. Author both in-family on the Phosphor grid and clear them
against the 14px grayscale ink-coverage gate as canvas textures:

- `status-severity-dot` family - four fill levels (hollow, quarter, half, solid)
  as four distinct silhouettes, each distinguishable from the others above the
  squint floor.
- `status-tier-notch` family - four stepped marks (1..4 filled steps), each
  distinct.

The ring/dash/slash/ghost treatments are drawn as anatomy `Graphics` primitives
in the sprite layer (the integration edit, deferred), parameterized by a pure
descriptor the prototype exercises directly.

## Tokens (per-theme literal hex, scene-read)

Add scene-read literal-hex tokens, declared in all three theme blocks
(light/dark/high-contrast), read through the existing `getComputedStyle` token
seam - never a `var()` chain. Reuse existing state tokens where they already fit;
add only what is missing. The stamp tint reinforces the treatment, never carries
it: `affirmed`/`provisional` ride the accent or ink token; `negated` and
`retired` ride the muted/archived token; `graded` rides a severity token set
(kept warm-neutral, not pure-red, per warmth-in-tokens, with diff red reserved);
`tiered` rides ink. Each new token gets a `tokenReads` assertion.

## Hover-bloom card anatomy and motion

The card is a transient, lighter DOM-island variety hosted beside the opened
interior, keyed off the hover id (not the opened-id set):

- Anatomy: a header row (the node's own glyph as the card icon - object
  constancy - plus the title), a status chip (the `status_value`, colored by the
  class token), the rollout bar for plan/feature progress, and a microline
  (`authority_class` and the tier or severity). An explicit open-document
  affordance (a Lucide external-link glyph) sits in the header corner.
- Object constancy: the card grows FROM the glyph anchor (transform-origin at the
  glyph center); the field glyph is conceptually the card's header icon.
- Motion: bloom in ~180ms ease-out after a ~150ms hover dwell; bloom out ~120ms
  ease-in. Animate transform and opacity only. The surrounding field recedes by
  luminance (reuse the ego-lift recede), not blur. Under
  `prefers-reduced-motion`, replace the grow travel with an instant (~0.01ms)
  crossfade - content still appears, only motion is removed.
- Three intents, separated: hover -> transient bloom (dismiss on mouse-out and
  after the dwell); click/focus -> pin the card; the affordance -> open the full
  interior. The card reads content only through a stores node-detail hook and
  never fetches from the scene.

## Module map: net-new (now) versus wiring (deferred)

Net-new, collision-free, authorable in isolation now:

- `frontend/src/scene/field/statusStamp.ts` - pure: `status_class` (+ ordinal)
  to a treatment descriptor and stamp geometry; no Pixi, no DOM, unit-testable.
- `frontend/src/scene/field/marks.ts` - add the two new mark families (the only
  shared scene file the in-flight branches do not touch).
- `frontend/src/scene/field/statusStamp.test.ts`, `markGate` additions - tests.
- `frontend/src/app/islands/HoverCard.tsx` (+ render test) - the card component,
  driven by a typed status-card view model.
- A standalone prototype harness (a separate Vite entry, e.g. `prototype.html` +
  `frontend/src/prototype/StatusGallery.tsx`) rendering the full doc-type x
  status matrix and an interactive hover-card demo, so the design is visually
  inspectable now without touching the shared router.

Wiring edits, deferred to post-merge (they touch files the representation work is
actively editing):

- `frontend/src/scene/field/nodeSprites.ts` - call `statusStamp` in the anatomy.
- `frontend/src/scene/sceneController.ts` - add the status fields to the node
  data (flagged seam redline).
- `frontend/src/scene/sceneMapping.ts`, `frontend/src/stores/server/engine.ts` -
  thread the wire fields.
- `frontend/src/app/stage/Stage.tsx`, `frontend/src/stores/view/viewStore.ts`,
  `frontend/src/app/islands/IslandLayer.tsx`, `frontend/src/stores/server/queries.ts`
  - the hover-id slice, the hover-event handling, and mounting the card island.

## Verification hooks

The prototype is green when the new marks clear the gate, `statusStamp` unit
tests assert the full class-to-treatment table, the HoverCard render test asserts
the anatomy and the reduced-motion crossfade, and the harness renders the full
matrix for visual inspection. The integration is green later when the deferred
wiring lands on the merged base and the canvas shows distinct stamps across ADR,
plan, audit, and rule nodes with a working hover-bloom.
</content>
