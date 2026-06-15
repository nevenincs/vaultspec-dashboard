---
tags:
  - '#research'
  - '#node-visual-richness'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-14-graph-node-salience-adr]]'
  - '[[2026-06-14-graph-representation-adr]]'
  - '[[2026-06-14-dashboard-node-canvas-adr]]'
  - '[[2026-06-14-dashboard-iconography-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

# `node-visual-richness` research: `typed, status-bearing node rendering for the graph canvas`

The dashboard renders the spec-driven second brain as a GPU node graph, and the
product's whole value is that a node is a *document of a kind* with a *lifecycle
status that matters* — an ADR that is accepted vs. superseded, a plan and its
rollout, an audit and its worst severity, a rule that is active vs. retired. The
risk this research addresses is the Obsidian/Roam failure mode: a field of
near-identical dots that shows topology but hides task-relevant state, "beautiful
but useless." The goal is a richer, modern node rendering — a far-LOD
**status-stamped glyph** (type carried by silhouette, status carried by one
grayscale-safe treatment) that, on **hover**, blooms into a full rich
mini-document card (kind icon, title, status chip, progress, tier/authority
microline). This document consolidates three things: (1) the external
data-visualization and rich-node-UX evidence, (2) the current shipped code vs. the
accepted spec, and (3) — decisively — what the three in-flight campaign builders
have already landed, so the feature is scoped to its genuine net-new surface and
does not duplicate or collide with work in progress.

## Findings

### 1. Consolidation against work in flight (the load-bearing finding)

Three agents are building the node-graph campaign concurrently in locked
worktrees. Their state as of this research determines exactly what this feature
must build versus consume:

- **`graph-node-semantics` (finished, unlocked).** Landed the engine *ontology
  projection* and threaded it onto the wire and into the stores mirror: each node
  now carries `authority_class` (design / roadmap / evidence / judgment / law /
  substrate / manifest / unknown) and an `aggregate` hint (exec records collapse
  into their parent plan); each edge carries a `derivation` label (`grounds`,
  `authorizes`, `generated-by`, `aggregates`, `reviews`, `promoted-from`) carried
  *alongside* the inference tier. Stores types and mock/corpus fidelity were
  updated to match.
- **`graph-node-salience` (in flight, actively running).** Landing the engine
  *salience projection* — a per-lens importance scalar over the bounded graph,
  Personalized-PageRank + betweenness + coreness on the tier-weighted backbone,
  plus the `lens` request parameter and DOI-bounded serving. Salience consumes a
  coarse internal lifecycle bucket (a `Retired` class folding archived-feature /
  superseded-rule / deprecated-ADR) as one of its inputs.
- **`graph-representation` (in flight, actively running).** Landing the *scene
  consumer*: `nodeRadius` is now **salience-driven** (superseding the old
  member-count-only rule) with a base→`SALIENCE_RADIUS_MAX` band, a new
  `labelPriority` for the DOI label cull, `salience`/`embedding` added to the
  scene node data and `derivation` to the scene edge data, plus the lineage and
  (gated) semantic layout modes, the anti-hairball backbone, disparity filter, and
  edge bundling.

**The decisive gap.** None of the three landed the per-type *lifecycle status
vocabulary* the semantics ADR specified — the wire node's `lifecycle` is still the
thin generic `{ state, progress }` with five collapsed values
(`active|complete|archived|broken|stale`). The salience builder only reads a
coarse `Retired` collapse internally; it does not surface ADR `proposed/accepted/
rejected/deprecated`, audit `max_severity`, rule `active/superseded`, plan
`tier`, or feature `in_flight/archived` as distinct wire fields. So the exact
properties the product is *about* — "is this ADR accepted or superseded, is this
plan in-flight, how severe was this audit" — are **not visible on any branch
today**. That data-plane extension, plus the scene status-stamp and the
hover-bloom card, is this feature's net-new surface.

**Net-new vs. consume:**

| Layer | Already in flight (consume) | Net-new (this feature builds) |
| --- | --- | --- |
| Engine / wire | `authority_class`, `aggregate`, edge `derivation`, `salience`, `lens` | **Per-type lifecycle status** (ADR status, plan tier, audit `max_severity`, rule `active/superseded`, feature `in_flight/archived`, `generated` flag) as additive node fields |
| Stores | ontology + salience mirrors, `lens` param | Mirror the new status fields; a compact node-detail projection for the card |
| Scene size/label | salience→size, `labelPriority` | **Status-stamp treatment** (outline/ghost/slash/dot/tier-mark) in the sprite anatomy; new status marks |
| Scene marks | doc-type silhouettes, tier/state marks, the 14px ink-coverage gate | New **status-mark family** authored in-family + gated |
| Interaction | ego-lift on hover, opened-island interior | **Hover-bloom card** (mid-weight DOM island), Stage `hover` handling, hover-id view slice |

### 2. Encoding theory: type and status on one small mark, grayscale-first

The channel-ranking spine (Bertin → Mackinlay → Munzner) splits visual channels
into *identity* channels (categorical — "what is it") and *magnitude* channels
(ordered — "how much"). Doc-type is categorical; lifecycle status is partly
categorical (proposed/accepted/rejected; open/closed) and partly ordered (tier
L1–L4, rollout fraction, severity level). The governing rule is to match each
status to a treatment whose channel *type* matches the status's data type — and
to spend exactly one treatment per node at the far LOD, because pop-out
(pre-attentive, &lt;0.5s) collapses to serial search the moment two pop-out
channels are stacked.

- **Type → silhouette + in-family glyph.** Shape is the weakest identity channel
  but the only color-independent one, and viewers can only hold a handful of
  shapes in memory — ten doc-types exceed that. The mature resolution (Cytoscape,
  Gephi) is a small set of *container silhouettes* (3–5 coarse classes) with a
  finer domain glyph inside; here the coarse class can follow `authority_class`
  (design / roadmap / evidence / judgment / law / substrate / manifest), and the
  fine glyph is the existing per-type Phosphor mark. Color reinforces, never
  carries.
- **Status → one channel-matched treatment.** What reads vs. collides at ~14px in
  grayscale: outline style (solid / dashed / double reliably separable; dotted
  vs. dashed collide); ghosting / reduced luminance (excellent for "retired" —
  superseded / deprecated / archived; near-universal reading); a single bold
  slash for a terminal-negative state (rejected) — thin strikes vanish; a single
  corner badge as a *silhouette* not text (one max — badges stack badly); a
  progress *arc* (radial reads at 14px; a linear bar does not below ~24px); a
  single severity dot whose *fill pattern* (hollow→half→solid) encodes the level
  (counting dots fails at 14px); a tier mark as a 4-step *notch/stepped fill*
  (the "L3" *text* fails at 14px — reveal it only in the hover card).

This maps cleanly onto the campaign's status families and is consistent with the
representation ADR's already-stated intent ("a superseded ADR reads faded/struck,
an audit's worst severity tints its treatment"). It refines that intent into a
specific, gate-testable per-type treatment set.

### 3. The rich-node / card idiom and the hover-bloom interaction

Every mature canvas tool treats a node as *dual-representation selected by
on-screen size*, never one rendering. tldraw uses an explicit ~50px screen-size
threshold and graded LOD (text-shadow/decoration dropped first when zoomed out)
and culls off-screen shapes — "10,000 shapes, 50 rendered." ReactFlow's idiomatic
rich node is a card (icon + title + status footer + a dedicated status indicator)
but renders DOM and does *not* auto-LOD — you must gate card rendering yourself,
and it tops out in the low thousands. Cosmograph/cosmos.gl scales to millions but
a GPU point *cannot be a card*. The lesson for a GPU field is structural: the
ambient field is the instanced-glyph regime and the card is the
DOM/rich regime, joined by a zoom/focus/hover threshold — you never make the GPU
field render cards, and you never make the card path render thousands. This is the
direct mechanical reading of the bounded-by-default and LOD rules: the full card
is hover/focus-only, O(1)–O(10) at any moment.

The hover-bloom is the focus+context "bloom" pattern, and **object constancy is
load-bearing**: the card must *grow from the glyph* (shared identity — the
field glyph becomes the card's header icon), not cross-fade a new surface over a
dimmed node. Surrounding nodes recede via reduced luminance/scale (a push-back,
not a blur texture — keeping warmth in tokens). Timing: bloom in ~150–250ms
ease-out after a short ~120–200ms hover-dwell (the dwell prevents the field
flickering as the cursor crosses nodes); bloom out faster ~120ms. Animate only
`transform`/`opacity` for 60fps. Under `prefers-reduced-motion`, replace the
grow-from-glyph travel with an instant/0.01ms crossfade — the card *content* still
appears (information is never hidden), only the motion is removed. Three intents
stay cleanly separated and emitted as *intent*, never fetched by the view:
hover → transient bloom; click/focus → pin the bloom; an explicit affordance in
the card → open the full document. This sits exactly between the two rungs that
exist today (far glyph + scene-side ego-lift, and the heavyweight opened-island
interior) — a mid-weight "hover card LOD" that none of the in-flight work builds.

### 4. Anti-patterns to honor

The Obsidian-graph critique is the design's north star *by negation*: it shows
connections but "not priorities, status, or what you need right now," degrading
from useful (~50 nodes) to hairball (~200) to perf drain (~500). Encoding
task-relevant state on the mark is precisely the antidote — so the status channel
is a first-class requirement, not decoration. Two further guardrails: decoration
creep (gradients, textures, skeuomorphism, a second accent) erodes the clean
instrument register — mature tools drop decoration *first* under LOD, proving it
was never load-bearing; richness must come from structure (silhouette, outline,
fill-level, soft radius/elevation, one restrained micro-interaction) and semantic
tokens. And over-encoding a single mark into noise — five stacked treatments, none
of which pop and all of which collide at 14px — is defeated by the rule of one:
one type encoding + exactly one status treatment at field LOD, with everything
else deferred to the hover card where there is room and time to read it. The 14px
grayscale ink-coverage gate is the structural enforcement of this discipline.

### 5. Insertion points (grounded in shipped seams)

The texture/gate/mark infrastructure and the anchor/island infrastructure are
production-ready and were designed for this. New status marks are authored as a
mark-def family in the central mark inventory, cleared against their family by the
grayscale gate, and reach the GPU through the production `DomainGlyphs` provider's
mark-texture path and the DOM through the shared mark components — no new infra,
only new geometry plus a gate assertion. The status stamp is a new child in the
sprite near-LOD anatomy (and a far-LOD treatment delta), reading its tint from a
new literal-hex token declared per theme and read via the existing
`getComputedStyle` token seam (never a hard-coded hex, never a `var()` chain the
scene cannot flatten). The hover card is best hosted as a *second, lighter island
variety* reusing the existing screen-anchor subscription (`trackNode`) and island
styling, keyed off the `hover` scene event (which the stage currently ignores and
must start handling) and a hover-id view-store slice, rendering a compact
projection from a stores node-detail hook — never fetching from the scene.

Binding layer-ownership constraints from the rules and ADRs: the scene stays a
dumb view (data only via controller commands, intent only via events, never
fetches, never reads the raw tiers block); stores is the sole wire client, so
status / authority / salience must arrive as engine *projection fields*, never
inferred in the sprite layer from raw degree or guessed from a transport error;
the new per-type status fields are additive and must not perturb the node/edge
stable-key derivation (caches, animations, time-travel by id stay valid); and any
controller-seam extension is an ADR-flagged redline, not a drive-by edit.

### 6. Sequencing reality

Because the per-type status fields are an engine/wire extension and the scene
status-stamp lands in the same sprite module the representation builder is
actively editing, this feature *consumes* the in-flight ontology + salience data
plane and *extends* the representation scene consumer. The clean order is: the
three in-flight branches settle → the per-type status fields land on the wire (the
genuine data-plane gap) → the scene status-stamp + new status marks → the
hover-bloom card. Building the status-stamp on `main` ahead of the representation
merge collides on the sprite module; the hover-bloom card and the new status-mark
family are the lowest-collision slices and can proceed earliest.

## Open questions for the ADR

- Does the per-type status vocabulary land as a `lifecycle` *extension* (richer
  fields on the existing object) or a sibling `status` projection block? The
  semantics ADR named it a `lifecycle` extension; confirm against what the
  semantics builder actually shaped so the ADR amends rather than forks.
- Is the coarse-class container silhouette (authority_class → 3–5 silhouettes)
  adopted now, or is type kept at the existing per-type Phosphor glyph with status
  as the only added channel? The former is more legible at scale but is a larger
  mark-authoring effort and a visible change to every node.
- Card-bloom host: confirm the DOM-island variety over a GPU-drawn card (the
  research favors DOM for rich text/layout and zero collision with the sprite
  module).
</content>
</invoke>
