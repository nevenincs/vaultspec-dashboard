---
tags:
  - '#adr'
  - '#node-visual-richness'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-14-node-visual-richness-research]]'
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-14-graph-node-salience-adr]]'
  - '[[2026-06-14-graph-representation-adr]]'
  - '[[2026-06-14-dashboard-node-canvas-adr]]'
  - '[[2026-06-14-dashboard-iconography-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

# `node-visual-richness` adr: `status-stamped glyph and hover-bloom card` | (**status:** `accepted`)

## Problem Statement

The graph is the product, and the product's value is that a node is a *document of
a kind* whose *lifecycle status is the thing a reviewer needs* — an ADR that is
accepted versus superseded, a plan and how far its rollout has come, an audit and
its worst severity, a rule that is active versus retired. The node-graph campaign
has settled most of the supporting model: the semantics ontology ships
`authority_class`, the `aggregate` hint, and edge `derivation` labels; salience
ships a per-lens importance scalar; representation consumes salience as node size
and adds the layout modes and the anti-hairball backbone. But a concrete
consolidation against the in-flight work found the decisive gap: **the per-type
lifecycle status the semantics ADR named was not actually shipped on the wire.**
The wire node's `lifecycle` is still the thin generic `{ state, progress }` with
five collapsed values; the ontology projection added authority and derivation but
no status; the salience projection reads only a coarse internal "retired" bucket.
So the engine cannot today tell a consumer that an ADR is `deprecated` rather than
a plan being `complete`, an audit's `max_severity`, or a rule being `superseded`.

The result is the Obsidian/Roam failure mode the representation research warns
against: a field that renders topology and type but hides task-relevant state —
"beautiful but useless." This ADR settles the **visual richness layer**: the
engine projection of a per-type status, a single grayscale-safe **status stamp**
on the node glyph, and a **hover-bloom** that grows the glyph into a rich
mini-document card. It is the consumer-facing completion of the campaign — it
completes the status half of the semantics ADR's promise and amends the
node-canvas and representation rendering ADRs with the status-treatment and
card-LOD seams they declared they would need. It is spec work; it writes no code.

## Considerations

The research consolidated three bodies of evidence, and they converge on a small
set of decisions.

**Status is a normalized engine projection, not a per-type rule the view
re-derives.** The semantics ADR already established that ontology is a
read-and-infer projection the engine owns and the view consumes; the status
extension follows the same law. The engine — which already owns the doc-type
knowledge in its ontology module — projects each node's type-specific status into
two additive fields: a `status_value` (the literal type-specific status, e.g.
`accepted` / `deprecated` / `rejected` / `proposed` for an ADR, the tier `L2` for
a plan, the severity `high` for an audit, `active` / `superseded` for a rule,
`in_flight` / `archived` for a feature) and a `status_class` drawn from a small
closed enum naming the *treatment family* the renderer maps to exactly one stamp:
`affirmed` (accepted / active / in-flight), `provisional` (proposed / draft),
`negated` (rejected), `retired` (deprecated / superseded / archived), `graded`
(audit severity, carrying its ordinal level), and `tiered` (plan tier, carrying
its ordinal step). The existing `progress { done, total }` is retained unchanged
and drives the rollout arc. This split is the load-bearing choice: the engine owns
the per-type-to-class mapping (read-and-infer, where the doc-type knowledge lives)
and the scene owns class-to-treatment (one treatment per class — the rule of one),
so the view never re-derives status from `doc_type` and a new doc-type's status is
a one-line engine map entry, not a renderer change.

**One status channel, chosen to be grayscale-legible and channel-matched.** The
encoding theory (Bertin / Mackinlay / Munzner) is unambiguous: shape is the only
color-independent identity channel and viewers hold only a handful of shapes, so
type stays on the silhouette-plus-glyph already shipped; status takes exactly one
*additional* treatment, matched to its data type. Categorical status classes map
to identity treatments — `affirmed` is a solid ring, `provisional` a dashed ring,
`negated` a bold single slash, `retired` a luminance ghost (and a slash when both
apply, e.g. a superseded rule). Ordinal status classes map to magnitude
treatments — `graded` a single severity dot whose fill pattern (hollow → half →
solid) encodes the level, `tiered` a four-step notch, and `progress` the radial
rollout arc that already exists. Color reinforces through the token tier but never
carries: the stamp reads in pure grayscale, clearing the 14px ink-coverage gate.
The rule of one holds at field LOD — one type encoding plus one status treatment;
everything else defers to the hover card, where there is room and time to read it.

**The hover card is a third LOD rung, not a new model.** Today there are exactly
two rungs — the far-LOD glyph (with the scene-side ego-lift that promotes the
1-hop neighborhood) and the heavyweight opened DOM-island interior. Mature canvas
tools (tldraw, ReactFlow, Obsidian Canvas) all treat a node as
multiple-renderings-selected-by-size, and the missing middle is a *transient rich
card* that appears on hover without a click-to-open. It blooms from the glyph
(object constancy: the field glyph becomes the card's header icon, the card grows
from the glyph anchor) and the surrounding field recedes by luminance; it carries
the kind icon, title, an explicit status chip, the rollout bar, and a
tier/authority microline. The card is a *projection over fields already served* —
it is not a new fetch from the scene and not a new model. Three intents stay
cleanly separated and are emitted as intent, never fetched by the view: hover →
transient bloom, focus/click → pin the bloom, an explicit affordance in the card →
open the full document.

**Salience-size and status-stamp are orthogonal channels and must not compete.**
The representation build already drives node *size* from salience; this ADR adds
status as a *treatment* channel. Type is shape, salience is size, feature is hue,
status is the one stamp — four channels, none colliding, each answering a
different question (what is it / how important / whose is it / what state is it
in). This orthogonality is what keeps the enriched node legible rather than noisy.

## Constraints

- **Read-and-infer; the status projection is never written back.** `status_value`
  and `status_class` are inferred by the engine ontology from frontmatter, the H1
  status line, plan check-state, and audit finding headings — exactly the sources
  the ontology already parses. The engine never writes status into documents and
  an unparseable or convention-predating document degrades honestly to an absent
  status (drawn with no stamp), never a fabricated one.
- **Additive on the wire; no re-keying.** The status fields are additive node
  fields that do not enter the node stable-key derivation, so caches, animations,
  and time-travel by id stay valid (the provenance-stable-keys guarantee). The
  scene-controller seam extension (the status fields on the node data, the
  hover-card command/state) is an ADR-flagged redline, not a drive-by edit.
- **Stores is the sole wire client; the scene is a dumb view.** Status arrives as
  engine projection fields the stores layer fetches and mirrors; the scene renders
  the stamp from `status_class` and never infers status from `doc_type`, raw
  degree, or a transport error. Degradation is read from the tiers block. The hover
  card, hosted as a DOM island, reads its content through a stores node-detail hook
  and never fetches from the scene.
- **Bounded by default; the card is hover/focus-only.** The rich card is O(1)–O(10)
  at any moment, gated to hover-dwell, focus, or pin — the ambient field is always
  glyphs. No richer LOD ever drives an unbounded query; if the card's content hook
  descends, it stays scoped and ceiling-bounded.
- **Icons from the two sanctioned families, through the one seam, past the gate.**
  Any new status mark (the severity-dot fill levels, the tier notch) is authored
  in-family on Phosphor's grid, cleared against its family by the 14px grayscale
  ink-coverage gate as a canvas texture, and reaches the GPU through the existing
  texture-provider mark path and the DOM through the shared mark components.
- **Warmth in tokens, not decoration.** Richness comes from structure (silhouette,
  outline treatment, fill level, soft radius and elevation) and the semantic token
  tier; no gradients, textures, skeuomorphism, or a second accent. Stamp tints are
  literal-hex theme tokens read through the existing scene token seam, never
  hard-coded and never a `var()` chain the scene cannot flatten. Diff coloring stays
  sacred. Motion is fast and subtle; keyboard-initiated actions do not animate and
  `prefers-reduced-motion` swaps the bloom travel for an instant crossfade.
- **Depends on, and is gated by, the in-flight campaign.** This feature consumes
  the ontology fields (semantics, merged-ready), the salience field and `lens`
  param (salience, in flight), and the representation scene consumer (salience-size,
  in flight) — the last two land in the same sprite and controller modules the
  status stamp touches. The build is sequenced to begin only when those branches
  have merged to the trunk, so the status stamp layers onto the settled sprite
  module rather than colliding with it. The status *projection* is the one genuinely
  new engine surface and is additive over the settled ontology module.

## Implementation

The feature lands in three layers, each consuming the one below.

**Engine status projection.** The ontology module grows a per-type status
inference beside the existing authority and derivation projections: a function from
`doc_type` plus the parsed lifecycle facet to `(status_value, status_class)`,
mapping ADR H1 status, plan tier and check-state, audit worst-finding severity,
rule active/superseded, and feature in-flight/archived into the literal value and
the closed treatment class. The two fields are served as additive node fields
through the shared envelope helper, carrying the tiers block like every response,
and the stores layer types and mirrors them — the same path the ontology fields
already travel. The existing generic `lifecycle { state, progress }` is retained
for backward compatibility and the generic fill; `status_class`/`status_value` are
the precise additions the stamp reads.

**Scene status stamp.** The sprite anatomy gains a status-stamp channel that maps
`status_class` to one treatment: the outline treatments (solid / dashed / slash /
ghost) are drawn as sprite/anatomy primitives; the `graded` severity dot and the
`tiered` notch are new marks authored in the mark inventory and gated. The stamp
rides the node's salience-driven radius (consuming, not competing with, the
representation size channel) and reads its tint from a new literal-hex status token
declared per theme. At far LOD the field shows the coarsest stamp (ghost / slash /
ring) so retirement and rejection read at overview scale; full stamp detail (the
severity level, the tier step) unfolds at near LOD and on focus, matching the
existing anatomy LOD discipline.

**Hover-bloom card.** A new, lighter DOM-island variety is hosted beside the
existing opened-interior island, reusing the screen-anchor subscription and island
styling but keyed off a hover-id view slice fed by the `hover` scene event (which
the stage begins handling) rather than the opened-id set. It renders a compact
projection from a stores node-detail hook — kind icon, title, status chip, rollout
bar, tier/authority microline — growing from the glyph anchor with object
constancy, the field receding by luminance, after a short hover-dwell, with the
reduced-motion crossfade alternative. The scene-side ego-lift remains and fires
alongside the card. Click/focus pins the card; an explicit affordance opens the
full interior, keeping the three intents separated.

**Required amendments to accepted ADRs (named, not assumed).** This ADR amends
three: (1) **semantics** — the per-type status it specified is completed here as
the additive `status_value`/`status_class` projection the build omitted; (2)
**node-canvas** — the node anatomy gains the status-stamp channel and the
hover-card LOD rung the canvas ADR did not enumerate; (3) **representation** — the
encoding map's "superseded reads faded/struck, audit severity tinted" intent is
made concrete as the closed class-to-treatment set, and the card-LOD rung is added
to the LOD strategy. No new model is introduced; every layer is a projection over
the one `LinkageGraph`.

## Rationale

The decisions are what the consolidated evidence converged on, applied through the
seams the campaign already built. The status-as-normalized-projection choice is the
direct application of the semantics ADR's own read-and-infer discipline to the gap
that ADR left open, and the `status_class` indirection is what keeps the renderer
dumb — the project's layer-ownership law made concrete for status. The single
channel-matched stamp is textbook channel theory and is the precise antidote the
representation research names to the Obsidian "beautiful but useless" critique:
encoding task-relevant state on the mark is what makes this graph answer "what needs
attention," not just "what links to what." The hover-bloom-as-third-rung choice
fills the documented gap between the far glyph and the heavyweight interior with the
established dual-representation-by-size idiom, and grounding object constancy in the
grow-from-glyph transition is the dynamic-graph evidence's stability requirement.
Sequencing the build behind the trio merge is the honest reading of the
consolidation: the status stamp shares a module with the live representation work,
so layering after merge converts a guaranteed conflict into clean inheritance.

## Consequences

- **Gains.** The node finally tells the truth about state: a reviewer sees at a
  glance that an ADR is superseded, a plan is mid-rollout, an audit is critical, a
  rule is retired — in grayscale, at field scale — and on hover gets the full
  mini-document without leaving the canvas. The status projection completes the
  semantics ADR's promise as a re-derivable, deletable engine field, and the card
  is a clean projection that opens the path to other hover affordances.
- **Costs and difficulties.** The status parse is per-type and tracks the shipped
  templates faithfully, so a template change becomes a contract touch-point (the
  same cost the semantics ADR already carries). The new status marks must each
  re-pass the 14px gate as canvas textures. The hover card adds a transient
  DOM-island lifecycle that must dismiss cleanly and honor reduced motion, and the
  hover-dwell timing must be tuned so the field does not flicker.
- **Risks.** Over-stamping — more than one treatment per node at field LOD — would
  re-create the noise the rule of one prevents; the discipline is structural via the
  gate. A view tempted to infer status from `doc_type` would breach the
  dumb-view law; the `status_class` projection exists precisely so it never must. A
  card that fetched from the scene, or guessed availability from a transport error,
  would breach the layer and degradation laws. Building ahead of the trio merge
  would collide on the sprite module; the gate-on-merge sequencing is load-bearing.
- **Pathways opened.** A normalized status projection plus a hover-card rung makes
  future state-bearing affordances cheap: an audit/compliance lens, a "what changed"
  hover, a status-filtered view, or a richer card body all become parameterizations
  over the one status vocabulary and the one card host rather than bespoke surfaces.

## Codification candidates

- **Rule slug:** `node-status-is-a-normalized-engine-projection`.
  **Rule:** A node's lifecycle status reaches the renderer as an engine-projected
  `status_class` (a closed treatment-family enum) plus a `status_value`; the scene
  maps class to exactly one grayscale-safe treatment and never re-derives status
  from `doc_type`, raw degree, or a transport error. (Candidate only; must hold
  across a full execution cycle before promotion.)
- **Rule slug:** `one-status-treatment-per-node-at-field-lod`.
  **Rule:** At field level-of-detail a node carries exactly one type encoding
  (silhouette + glyph) and exactly one status treatment; additional state is
  deferred to the hover/focus card, never stacked on the field mark. (Candidate
  only; pending a cycle of use.)
</content>
