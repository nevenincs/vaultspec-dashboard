---
tags:
  - '#plan'
  - '#node-visual-richness'
date: '2026-06-14'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-14-node-visual-richness-adr]]'
  - '[[2026-06-14-node-visual-richness-research]]'
---


# `node-visual-richness` plan

### Phase `P01` - engine status projection

Project a per-type lifecycle status (status_value + status_class) over the ontology and serve it as additive node fields - the data-plane gap the campaign left open.

- [x] `P01.S01` - infer per-type status_value and status_class beside the authority and derivation projections; `engine/crates/engine-query/src/ontology.rs`.
- [x] `P01.S02` - serve status_value and status_class as additive node fields through the query projection; `engine/crates/engine-query/src/graph.rs`.
- [x] `P01.S03` - echo the status fields through the query route envelope with the tiers block; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P01.S04` - add engine unit and conformance tests for the per-type status mapping; `engine/tests/tests/conformance.rs`.

### Phase `P02` - stores mirror and mock fidelity

Type and mirror the status fields through the sole wire client and the live adapter, and reconcile the mock and corpus to the live wire shape.

- [x] `P02.S05` - type status_value and status_class on the wire node and the stores mirror; `frontend/src/stores/server/engine.ts`.
- [x] `P02.S06` - thread the status fields through the live adapter and the scene-mapping seam; `frontend/src/scene/sceneMapping.ts`.
- [x] `P02.S07` - mirror the per-type status in the mock engine and the corpus fixtures; `frontend/src/testing/mockEngine.ts`.

### Phase `P03` - scene status stamp

Map status_class to exactly one grayscale-safe stamp in the sprite anatomy, authoring and gating any new status marks and reading tints from per-theme literal-hex tokens.

- [x] `P03.S08` - add status_value and status_class to the scene node data as a flagged seam redline; `frontend/src/scene/sceneController.ts`.
- [x] `P03.S09` - author the status-mark family of severity-dot fill levels and the tier notch; `frontend/src/scene/field/marks.ts`.
- [x] `P03.S10` - clear the new status marks against the 14px grayscale ink-coverage gate; `frontend/src/scene/field/markGate.test.ts`.
- [x] `P03.S11` - declare per-theme literal-hex status tokens and the scene reader; `frontend/src/styles.css`.
- [x] `P03.S12` - render the status-stamp channel mapping class to one treatment under LOD discipline; `frontend/src/scene/field/nodeSprites.ts`.
- [x] `P03.S13` - add sprite-layer tests for the class-to-treatment mapping and token reads; `frontend/src/scene/field/nodeSprites.test.ts`.

### Phase `P04` - hover-bloom card

Add the transient rich mini-document card as a third LOD rung that blooms from the glyph on hover, hosted as a lighter DOM-island variety.

- [x] `P04.S14` - add a hover-id view slice and handle the hover scene event in the stage; `frontend/src/app/stage/Stage.tsx`.
- [x] `P04.S15` - build the hover-card DOM-island variety reusing the node anchor and island styling; `frontend/src/app/islands/IslandLayer.tsx`.
- [x] `P04.S16` - render the compact card projection from a stores node-detail hook; `frontend/src/stores/server/queries.ts`.
- [x] `P04.S17` - implement grow-from-glyph bloom with hover-dwell and a reduced-motion crossfade; `frontend/src/app/islands/HoverCard.tsx`.
- [x] `P04.S18` - add card render and interaction tests for bloom, dwell, reduced-motion, and the three intents; `frontend/src/app/islands/HoverCard.render.test.tsx`.

### Phase `P05` - integration, gate, and visual inspection

Land the full lint gate green, run the suites, visually inspect the canvas, and close the cross-ADR amendments.

- [x] `P05.S19` - run the full frontend and engine lint gate and test suites to exit zero; `frontend`.
- [x] `P05.S20` - visually inspect status stamps per type and the hover-bloom on the running canvas; `frontend/src/app/stage/Stage.tsx`.

## Description

Deliver the node-visual-richness feature accepted in the ADR of the same name:
richer second-brain graph nodes that carry their type-specific lifecycle status
and bloom into a rich mini-document card on hover. The work lands in three
consuming layers - an engine status projection (the genuine data-plane gap the
node-graph campaign left open, where the wire node still carries only a thin
generic lifecycle), a single grayscale-safe status stamp on the sprite anatomy,
and a hover-bloom card as a new mid-weight level-of-detail rung between the far
glyph and the heavyweight opened interior. It consumes the campaign's shipped
ontology, salience, and representation work and amends the node-canvas,
representation, and semantics rendering decisions. Grounding documents are the
node-visual-richness ADR and research in the related frontmatter.

This plan is GATED: the build begins only after the three in-flight node-graph
branches (graph-node-semantics, graph-node-salience, graph-representation) have
merged to the trunk, because the scene status stamp shares the sprite and
controller modules the representation work is actively editing. Authoring the
plan ahead of merge is safe; executing it before merge would collide. The status
projection in P01 is the one genuinely new engine surface and is additive over
the already-settled ontology module.

## Steps







## Parallelization

The phases carry a hard data-direction ordering: P01 (engine status projection)
must land before P02 (stores mirror) can type real fields, and P02 before P03
(scene stamp) and P04 (card) can read them. Within P01 the steps are sequential
(projection, then serving, then route, then tests). P02's three steps are
near-sequential along the same wire-to-scene path. P03 has internal parallelism:
the mark authoring and gate (S09, S10) are independent of the token declaration
(S11) and can proceed together, but both must precede the stamp render (S12) and
its tests (S13). P04 is mostly sequential (slice and event handling, then the
island, then the content hook, then motion, then tests), though the card
component shell (S17) can be drafted alongside the content hook (S16). P03 and
P04 are independent of each other once P02 lands and may run in parallel. P05 is
strictly last - the full gate and visual inspection close the plan.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- The engine serves `status_value` and `status_class` as additive node fields on
  the query projection, carrying the tiers block, with engine unit and
  conformance tests asserting the per-type mapping (ADR accepted/rejected/
  deprecated/proposed, plan tier, audit severity, rule active/superseded, feature
  in-flight/archived) and an unparseable document degrading to an absent status.
- The status fields are typed on the wire node and the stores mirror, threaded
  through the live adapter and the scene-mapping seam, and the mock engine plus
  corpus fixtures emit the same shape, proven by a captured-live-sample test
  through the adapter (mock mirrors the live wire shape).
- Each new status mark clears the 14px grayscale ink-coverage gate as a canvas
  texture, and the sprite renders exactly one status treatment per node at field
  level-of-detail (the rule of one), with stamp tints read from per-theme
  literal-hex tokens through the scene token seam - no hard-coded hex, no var()
  chain.
- The hover-bloom card appears on hover-dwell, grows from the glyph with object
  constancy, recedes the field, dismisses cleanly, swaps the bloom for an instant
  crossfade under prefers-reduced-motion, and keeps the three intents separated
  (hover bloom, focus pin, open-document affordance); it reads content only
  through a stores hook and never fetches from the scene.
- The full lint gate (`just dev lint frontend` and the engine gate) exits 0
  including prettier and rustfmt, the frontend and engine suites pass, and the
  running canvas is visually inspected to show distinct status stamps across ADR,
  plan, audit, and rule nodes and a working hover-bloom.
- A vaultspec-code-review pass signs off, and the node-canvas, representation, and
  semantics ADRs carry the amendment cross-reference this feature introduces.
