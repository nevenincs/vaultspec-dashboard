---
tags:
  - '#adr'
  - '#index-node-exclusion'
date: '2026-06-20'
modified: '2026-06-20'
related:
  - '[[2026-06-20-index-node-exclusion-research]]'
  - '[[2026-06-20-terminology-standardization-adr]]'
---

# `index-node-exclusion` adr: `Drop .vault/index at ingest and purge the index doc-type from all vocabularies` | (**status:** `accepted`)

## Problem Statement

`.vault/index/` documents are auto-generated feature-index metanodes — roll-up
manifests of a feature's documents, never authored knowledge. The accepted
`terminology-standardization` ADR (D5) settled that index is "never a *displayable*
node", but stopped at the serialization boundary: the engine still ingests index
documents as graph nodes, stores them, and categorizes them (authority class
`manifest`), filtering them out only in two wire projections. The `index` doc-type
also remains a first-class member of the category vocabulary on both the engine and
the dashboard. The directive for this campaign is stronger and absolute: an index
document must NEVER be served, categorized, graphed, timelined, or treated as a
feature, anywhere. It is a strictly-ignored element. This decision amends D5 from a
display filter to a hard ingest-level exclusion plus removal of the `index` type
from every categorization vocabulary, backend and frontend.

It also corrects a sibling confusion of the same root: the dashboard maps the
`summary` document kind to the `index` category. Summaries are `exec` documents
(`.vault/exec/*-summary.md`, a Phase Summary of execution records) — the engine
already classifies them `exec`. The mapping is corrected to `summary → exec`.

## Considerations

- The engine is read-and-infer: it owns no display vocabulary, but it DOES own
  "what is a node". Whether an index document becomes a node at all is squarely a
  producer (engine) concern, so the honest fix is at ingest, not at serialization
  (consistent with `terminology-standardization` D5's reasoning, taken one layer
  upstream).
- Index documents' `related:`/wiki-links yield core-declared edges INCIDENT to the
  index stem. Dropping the index node without also dropping those edges would let
  `edges::ingest` resurrect the index as a phantom node (doc_type-less, so the
  existing display filter would NOT catch it). The exclusion must therefore drop
  both the node and every incident edge — tracked via an excluded-id set built
  during the structural pass.
- `AuthorityClass::Manifest` exists solely for index and weights to `0.0` —
  identical to `AuthorityClass::None`. Removing it is behavior-preserving.
- `phase_for_doc_type` already returns `None` for index (no timeline lane), and
  lineage projects only phased nodes — so timeline exclusion is already transitive
  once the node is gone; no bespoke timeline filter is added.
- Figma is the binding source of truth for the category swatches; the eight-swatch
  board carries no `index` knowledge-node category, so removing the `index` token
  brings code toward the binding design rather than away from it.

## Constraints

- No new engine endpoints; the change is an ingest-time filter plus vocabulary
  deletions. Pure read-and-infer, no vault mutation.
- The scene category color is a generated DTCG token
  (`--color-scene-category-index`); it must be removed by regenerating the managed
  token region, never hand-edited (the literal-hex scene-token discipline).
- `declaring-green-runs-the-full-gate`: the full lint gate (`just dev lint all`)
  plus `cargo test`/frontend tests must pass before the campaign is declared green.

## Implementation

**D1 — Drop index documents at ingest (never a node).** Both node-minting sites —
the structural reader and the as-of replay — skip any document whose derived
`doc_type` is `index`; no node is upserted. An excluded-id set of index node ids is
collected during the structural pass, and the core-declared edge ingest drops any
edge incident to an excluded id, so no phantom index node is resurrected. Index
documents continue to exist on disk and be managed by the CLI; they simply never
enter the `LinkageGraph`.

**D2 — Purge `index` from the engine categorization vocabulary.** Remove the
`index → manifest` arm from the authority-class register and delete the now-unused
`AuthorityClass::Manifest` variant (folding to `None`, behavior-preserving). Update
the ontology/salience doc-comments and tests that enumerate `index`.

**D3 — Keep `is_displayable_node` as a single documented defensive guard.** The
display-layer index branch becomes dead on the live path but is retained as the one
belt-and-braces net (producer-drop + consumer-defense), re-documented as defending
against any future producer that re-mints an index node.

**D4 — Remove `index` from the dashboard category vocabulary.** Drop `"index"` from
`CategoryToken` (chrome) and `NodeCategory` (scene), delete the scene `index` switch
arm and its fallback color, and remove the generated `--color-scene-category-index`
token by regenerating the token source. Surfaces that previously branched on
`index` no longer carry it.

**D5 — Correct `summary → exec`.** The scene category mapping for the `summary`
kind is changed from `index` to `exec`, matching the chrome vocabulary and the
engine's classification of summary documents as `exec`. Lab/prototype fixtures that
carry an `index` doc-type node are updated so they do not reintroduce the vocabulary.

## Rationale

D5 of `terminology-standardization` already named the producer-side honesty
principle ("a node the product never shows should not ride the wire") but
implemented it as a display filter; research F1–F3 show index nodes are still minted,
stored, and categorized, so the principle is only half-applied. Dropping at ingest
is the complete form of the same principle and removes the residual blast radius
(stored metanodes, a live `manifest` authority class, a stray category token that a
future un-filtered projection could leak). Research F5 confirms the timeline and
feature paths need no bespoke filter — the single upstream drop plus the existing
phase/displayable guards cover them. Research F6 grounds the `summary → exec`
correction: summary is an exec document, and the `summary → index` mapping was the
same metanode confusion expressed in the color layer.

## Consequences

- The graph, rail, timeline, features, and salience are provably index-free at the
  source, not merely filtered — a smaller, honest model with one less metanode
  species to reason about.
- The category vocabularies (engine ontology + both dashboard category modules)
  shrink to the real knowledge species; one fewer token to theme across three
  themes.
- Summaries paint as `exec`, ending a long-standing miscolor.
- Pitfall: the excluded-id/incident-edge drop must be applied at BOTH node-minting
  sites and the declared-edge ingest, or a phantom index node reappears. The
  retained `is_displayable_node` guard is the safety net if a site is missed.
- Pitfall: the `index` scene token must be removed via regeneration; a hand-edit of
  the managed region would be overwritten and fail the token check.

## Scope amendment (code, 2026-06-21)

Mid-execution the user widened the directive: `code` is to receive the same
treatment as `index` — "both are to be removed, neither supported" — bounded to
the GRAPH/categorization layer only ("code as graph type only"). So, alongside the
index removal: `code` (`NodeKind::CodeArtifact`) is never a knowledge-graph node
(already enforced by `is_displayable_node` and the document-slice `kind == Document`
filter) and is removed from the dashboard's GRAPH categorization vocabulary — the
scene `NodeCategory` and the graph silhouette mark. The Files/search browser
(`CodeTree`, the browser `code` mode, `code:<path>` selection, the `/file-tree`
route, rag code search, the SearchPalette code species) is PRESERVED as a distinct
source-file surface and keeps its own `code` color token; it is not the knowledge
graph. `index`, by contrast, is removed everywhere with no surviving token, since a
feature-index has no non-graph purpose. A concurrent terminology-standardization
campaign editing the same frontend files was halted by the user and then converged
on this removal for the scene module.

## Codification candidates

- **Rule slug:** `index-documents-are-never-graph-nodes`.
  **Rule:** `.vault/index` feature-index documents (doc-type `index`) are dropped at
  engine ingest and never become `LinkageGraph` nodes, edges, timeline events,
  features, or a category token in either the engine or the dashboard; the `index`
  doc-type is not a member of any categorization vocabulary, and a single retained
  `is_displayable_node` guard defends the display boundary. (Supersedes the
  display-only half of `terminology-standardization` D5 — promote only after this
  cycle's review confirms the ingest drop holds.)
