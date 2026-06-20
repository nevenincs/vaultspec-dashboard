---
tags:
  - '#research'
  - '#filter-controls'
date: '2026-06-19'
modified: '2026-06-19'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace filter-controls with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `filter-controls` research: `unified filter controls cross-stack discovery`

Cross-stack discovery for unifying the dashboard's filtering experience: the
filter UI vocabulary (search bars, dropdowns, foldouts, flyouts), the shared
filter-state plane, the engine filter grammar, and the new document-metadata
filters the user requested (dangling, invalid, empty-scaffold, plus ADR/plan
lifecycle statuses). Driven by rag semantic search across the frontend, the
stores layer, the engine, and the vaultspec-core invalidation surface.

## Findings

### Frontend — rich kit, fragmented surfaces

The centralized kit already carries the filter primitives (`SearchField`,
`Chip`/`Badge`, `SegmentedToggle`, `Switch`, `Slider`, `Card`), but the filter
SURFACES were each bespoke: the main filter panel hand-built native
`checkbox`/`radio` rows, the right-rail search target was a hand-built
`role=radio` group, and there was no shared `Popover`/flyout — every popover
re-wired its own escape + outside-pointer dismiss. The toolbar advertised a
"Filter" dropdown affordance while the implementation was a docked panel.

### Stores — solid, already centralized

The shared filter plane is correct: a single `GraphFilter` shape carries tiers,
confidence, relations, structural-state, kinds, doc-types, feature-tags,
statuses, plan-tiers, date-range, and text; it flows through one canonical
dashboard-state patch and a generation-cached filter vocabulary. The stores
layer is the sole wire client. Gaps: the vocabulary adapter dropped the
already-served `statuses`/`plan_tiers`, and there was no health/metadata
dimension and no glob/regex feature search.

### Engine — matches the stores shape, missing the new dimensions

The engine filter grammar supports the same facets (text = substring, doc-types,
date-range = created). The `/filters` vocabulary is generation-cached. Missing:
glob/regex feature search, and document health. The wire node shape carried no
health flags and the engine had no integration with the validity layer. The
engine DOES already know two health signals from its own graph — broken outgoing
structural edges (dangling) and zero incoming edges (orphaned) — so those are
derivable without leaving the read-and-infer boundary; schema-dependent
conditions (invalid frontmatter, empty scaffold) would need a vaultspec-core
`vault check` ingestion.

### vaultspec-core — the authoritative health vocabulary

`vault check` exposes the condition vocabulary (dangling, orphans, frontmatter →
invalid, annotations → empty-scaffold, schema, references) and `vault stats
--invalid --orphaned`. The engine-derivable subset (dangling/orphaned) is the
first slice; the rest is a follow-up ingestion.

### Decision shape

A single canonical Filter menu (KIND → TOPIC → STATUS → HEALTH → EDITED) built
from centralized kit primitives, delivered as an anchored flyout, with STATUS
(lifecycle) and HEALTH (validity) as new facet kinds rendered only when the
engine serves their vocabulary (no dead controls). See the sibling ADR.
