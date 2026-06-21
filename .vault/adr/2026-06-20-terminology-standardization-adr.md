---
tags:
  - '#adr'
  - '#terminology-standardization'
date: '2026-06-20'
modified: '2026-06-20'
related:
  - "[[2026-06-20-terminology-standardization-research]]"
---

# `terminology-standardization` adr: `Adopt canonical vault doc-type name schema; exclude index and code from displayable nodes` | (**status:** `accepted`)

## Problem Statement

The dashboard translates vaultspec-core doc-type slugs into user-facing words in
at least three divergent places, and renders `index` documents and `code`
artifacts as if they were first-class knowledge nodes. The result is the same doc
type reading as "Steps" on one surface and "Note" on another, a generic folder
glyph standing in for the centralized category mark, and non-knowledge nodes
(generated indexes, source files) polluting the graph and the rail. This decision
settles ONE canonical name schema, applied consistently backend-and-frontend, and
ONE rule that `index` and `code` are not displayable knowledge nodes.

## Considerations

- The engine is read-and-infer and emits raw `doc_type`/`kind` strings; it owns
  no display vocabulary, and must not grow one (display is frontend-owned per
  dashboard-layer-ownership). Standardization of *labels* is therefore a frontend
  single-source-of-truth problem.
- Standardization of *what is a node* IS a backend concern: the wire should not
  emit nodes the product never displays, so the exclusion is enforced at the
  producer (engine projections) AND defended at the consumer (frontend), per the
  belt-and-braces pattern the bounded-query rules already use.
- The design system already carries the correct primitive for category identity:
  a per-category colored node mark (the `StatusDot` kit component bound to the
  `scene/category-*` tokens), not a folder glyph.

## Constraints

- No new engine endpoints; the change is a filter in existing projections plus a
  frontend consolidation. The `reference` category lacked a color token; it has
  been added (`scene/category-reference`) across Light/Dark/High-Contrast so the
  schema is complete.
- Figma is the binding source of truth; the rail redesign is authored in Figma
  first (LeftRail Vault variant) and code mirrors it.

## Implementation

**D1 — Canonical user-facing name schema (one map).** The vault doc types
translate to exactly: `research`→Research, `adr`→Decisions, `plan`→Plans,
`exec`→Steps, `audit`→Audits, `reference`→References. This vocabulary is defined
ONCE in a centralized frontend module and consumed by every surface (rail
sections, filter facets, search pills, graph legend, timeline lanes); the three
existing divergent maps collapse into it. Singular/plural and "Note"/"Steps"
divergences are resolved to the schema above.

**D2 — Canonical display ORDER is the pipeline order.** Doc-type folders render
research → decisions → plans → steps → audits → references everywhere (the
workflow's natural reading order), replacing the disagreeing order constants.

**D3 — Category identity is the centralized colored mark.** Rail rows lead with
the category-colored `StatusDot` (feature rows use the feature color), never a
folder glyph; `reference` uses the new `scene/category-reference` color.

**D4 — Left-rail hierarchy.** Features expand to category sub-groups
(Research/Decisions/…) which expand to documents; Documents groups by category
only. Both share the same category-folder row treatment for visual parity.

**D5 — `index` is never a displayable node.** The engine excludes `index`
doc-type documents from the graph projection and `/vault-tree` rows; the frontend
also excludes `index` from EVERY rail projection (Features and Documents) and from
graph rendering. `index` documents continue to exist on disk and be managed by the
CLI — they are simply not surfaced.

**D6 — `code` is never a displayable knowledge node.** `NodeKind::CodeArtifact`
("code") is excluded from the knowledge graph projection, and the frontend stops
defaulting unknown kinds to `code`; an unmapped kind is treated as unknown and not
painted as a code node. (Source files remain browsable under the Files tab, which
is a distinct surface, not the knowledge graph.)

## Rationale

The triplicated label maps (research F2) are exactly the drift the
single-registry disciplines exist to prevent; one source eliminates per-surface
divergence. Keeping labels frontend-side honors the engine's read-and-infer
boundary (F1) — the engine keeps emitting raw slugs, which stay stable identifiers
for caching and selection. Excluding `index`/`code` at the producer is the honest
fix (F4): a node the product never shows should not ride the wire, and defending
it again at the consumer prevents a regression if any other producer reappears.
Adopting the centralized category mark (F3, F6) makes one token edit re-theme
every surface and makes "a mark on a row" always mean a real, shared category.

## Consequences

- One label edit now reaches every surface; tests that assert literal labels move
  to assert the centralized map. The graph legend stops listing `code`/`index`.
- Smaller, cleaner graph and rail: no generated-index or source-file noise.
- Pitfall: `index`/`code` exclusion must be applied at every projection, not one;
  the frontend guard is the safety net. The `reference` color must stay bound
  across all three themes or References dots render black (the literal-hex scene
  seam).

## Codification candidates

- **Rule slug:** `doc-type-labels-have-one-canonical-map`.
  **Rule:** Every user-facing rendering of a vault doc type must read its word
  from the single centralized doc-type label map (the canonical schema
  Research/Decisions/Plans/Steps/Audits/References, pipeline order); no surface
  may hand-author or duplicate a doc-type → label mapping.
- **Rule slug:** `index-and-code-are-not-displayable-nodes`.
  **Rule:** `index` documents and `code` artifacts are never emitted or rendered
  as knowledge-graph nodes — excluded at the engine projection AND defended in the
  frontend; an unmapped node kind is treated as unknown, never defaulted to
  `code`.
