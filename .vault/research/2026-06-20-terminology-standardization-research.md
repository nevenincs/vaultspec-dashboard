---
tags:
  - '#research'
  - '#terminology-standardization'
date: '2026-06-20'
modified: '2026-06-20'
related: []
---

# `terminology-standardization` research: `Vault terminology standardization + index/code node exclusion`

The dashboard surfaces vault documents by their raw vaultspec-core doc-type slugs
(`research`, `adr`, `plan`, `exec`, `audit`, `reference`, `index`) and paints
graph nodes by a per-kind category palette. Two defects motivated this campaign:
(1) the user-facing translation of those slugs is duplicated and divergent across
the frontend, so the same doc type reads differently on different surfaces; and
(2) `index` documents and `code` artifacts leak through as displayable graph
nodes, where they are not legitimate knowledge nodes. This research maps every
producing and consuming surface, backend and frontend, so the decision can settle
one canonical schema and one exclusion rule.

## Findings

### F1 — The engine emits raw doc-type strings; it owns no display vocabulary

The doc-type vocabulary is a fixed string list `DIRECTORY_TAGS` in
`engine-graph/src/index.rs` (`adr`, `audit`, `exec`, `index`, `plan`,
`reference`, `research`); `doc_type_of()` derives a doc type from the first
`.vault/` subdirectory. The `Node` model carries `doc_type: Option<String>`
(`engine-model`), set only on `NodeKind::Document` nodes. The graph node
projection `node_view()` and the `/vault-tree` projection
`build_vault_tree_rows()` (both `engine-query/src/graph.rs`) serialize the raw
`doc_type` onto the wire. The only doc-type mapping in the engine is
`authority_class()` (`engine-query/src/ontology.rs`) — a semantic register for
salience lensing (design/roadmap/evidence/judgment/law/manifest/substrate), NOT a
UI label. **There is no display-name mapping in the engine, and there should not
be: user-facing labels are a frontend concern (dashboard-layer-ownership).**

### F2 — The user-facing label mapping is triplicated and divergent (frontend)

Three independent doc-type → label maps exist and disagree:

- `src/app/left/vaultRowPresentation.ts` `DOC_GROUP_LABELS`:
  research→Research, adr→Decisions, plan→Plans, exec→Steps, audit→Audits,
  reference→References, index→Index.
- `src/stores/view/filterSidebar.ts` `FILTER_SIDEBAR_DOC_TYPE_LABEL`: same, but
  reference→"Reference" (singular), plus extras (summary, code).
- `src/stores/server/searchPill.ts` `DOC_TYPE_WORD`: exec→"Note", singular
  forms (Decision/Plan/Audit), feature included.

The graph `CategoryLegend.tsx` hardcodes a fourth label set in Figma-alias
vocabulary (decision/step/summary, audit→"Review"). Tests assert on the literal
labels (`SectionLabel.render.test.tsx`, `phaseLanes.test.ts`,
`filterSidebar.test.ts`).

### F3 — Category color: `reference` had no token; unknown defaults to `code`

The eight category color tokens (`--color-scene-category-*`) cover adr, audit,
code, exec, feature, index, plan, research — `reference` had none (now added as
part of this campaign). `nodeCategory()` in `src/scene/field/categoryColor.ts`
maps `reference→research`, `summary→index`, and crucially **defaults every
unknown kind to `code`** — so any unmapped node paints as a "code" node, a latent
correctness bug.

### F4 — `index` and `code` leak through as displayable nodes

- Backend: `index` is in `DIRECTORY_TAGS`, so `.vault/index/*.index.md` are
  indexed and emitted as graph nodes and `/vault-tree` rows with no skip. `code`
  artifacts are `NodeKind::CodeArtifact` (`kind_prefix` → `"code"`), emitted via
  the resolver, also unfiltered from `/graph/query`.
- Frontend: `projectVaultDocTypeGroups()` skips `index` for the Documents
  section, but `projectVaultTreeFeatureGroups()` (the Features grouping) does
  NOT — so index docs surface under features. No client-side filter removes
  index/code graph nodes.

### F5 — Doc-type ORDER constants disagree and embed `index`

`VAULT_GROUPS` and `VAULT_TREE_DOC_TYPE_ORDER` list index last;
`VAULT_RAIL_DOC_TYPE_ORDER` omits it. None follow the natural pipeline order
(research → adr → plan → exec → audit → reference) that reads as the workflow.

### F6 — The left rail conflates structure with hierarchy

The Features section renders feature folders that expand to a FLAT list of
documents (no doc-type grouping), and both Features and Documents use a generic
Lucide folder glyph rather than the centralized category mark. The design system
already carries the right primitive: a per-category colored node mark
("Graph nodes — one colour per document type") realized by the `StatusDot` kit
component and the `categoryColorVar` mapping.
