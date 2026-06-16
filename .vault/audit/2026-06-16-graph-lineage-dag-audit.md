---
tags:
  - '#audit'
  - '#graph-lineage-dag'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# `graph-lineage-dag` audit: `aggregate-LOD super-node render deferral`

## Scope

This note records a single deferred enhancement surfaced by the graph-viz-framework
W03 code review: the lineage derivation-DAG layout computes an aggregate level-of-detail
(per-plan exec super-nodes) above the node-count threshold, but no renderer draws those
super-nodes, and the original destructive collapse removed the collapsed exec members
from placement entirely. On the live corpus (642 exec documents, above the 600 threshold)
that left every collapsed exec with no position — an origin pile-up — and the super-nodes
themselves never drew.

## Findings

The aggregate-LOD design (`graph-lineage-dag` ADR D8) collapses each plan's exec column
into one per-plan super-node (`agg:exec:{planId}`) when the served slice approaches the
node ceiling, to keep the long exec tail from swamping the field. The layout module
(`lineageLayout.ts`) computed the collapse and filtered the collapsed members out of both
the spine and the off-spine placement, expecting the super-node to replace the column.

The seam was never finished at the render layer. The field assembly consumed only the
layout's routes, not its aggregates, and the sprite layer (`nodeSprites.sync`) draws
exactly the model's node set with no channel for a synthetic node that is not in the
shared `SceneGraphModel`. So a collapsed exec member received no position (it was filtered
out of the layout) and its would-be super-node was never injected into anything that
draws — the live 642-exec view piled the collapsed execs at the world origin.

Rendering the super-nodes properly (approach A) would require either threading a
lineage-only concept (exec aggregation) through the shared model — and therefore through
edges, hit-testing, the FA2 layout backbone, overlays, the incremental-reheat diff, and
the set-data signature — or invasive surgery to give the sprite layer a synthetic-node
channel. That is broad architectural reach for a per-mode spatialization detail, and it
cuts against the shared-model ownership boundary (the model is mode-agnostic truth; a
representation mode is a projection over it, not a mutation of it).

## Recommendations

Adopted the non-destructive fix (approach B): aggregation no longer removes members from
the layout. `buildAggregation` still computes the per-plan grouping as ADVISORY metadata
(`aggregates`), but returns an empty `collapsedTo`, so every exec keeps a real Sugiyama
spine (or off-spine) position. The crossing-reduced coordinate-assignment pass already
spreads a 600-plus-row column legibly via occupancy-derived row/column pitch, so the live
642-exec view renders correctly with no origin pile-up and no super-node draw.

Deferred enhancement: render the per-plan exec super-nodes as a genuine collapse (one
drawn body replacing the column, expand-on-click reconciled by the stable `agg:exec:`
id). This needs a synthetic-node render channel in the scene layer — a contained way for
a representation mode to contribute drawn nodes that are not in the shared model — built
once and reusable by any future aggregate-LOD mode. The advisory `aggregates` metadata is
already produced and stable-keyed, so that channel is the only missing piece. The
deferral is also recorded inline in `lineageLayout.ts` (the `Aggregation` interface and
`buildAggregation` doc comments) so the next agent meets it at the code.

## Codification candidates

None. This is a single feature-specific deferred enhancement, not a cross-session
constraint; it does not meet the durability bar for a project rule.
