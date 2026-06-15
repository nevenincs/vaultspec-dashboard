---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S03'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Collect edges among the kept nodes from the shipped relation and tier edges with a graceful fallback when the derivation field is absent and ## Scope

- `engine/crates/engine-query/src/lineage.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Collect edges among the kept nodes from the shipped relation and tier edges with a graceful fallback when the derivation field is absent

## Scope

- `engine/crates/engine-query/src/lineage.rs`

## Description

- Added `lineage_arc`, projecting a stored edge into a `LineageArc` carrying the stable edge id, src, dst, relation wire name, tier wire name, and confidence.
- Collected edges from the shipped relation/tier edges in scope that pass the filter, built once the kept node set is known so the arc set stays self-consistent.
- Implemented the graceful derivation fallback: the shipped `engine_model::Edge` carries no `derivation` field yet, so the arc's `derivation` is `None` and the projection draws real lineage from the shipped relation/tier truth; `lineage_arc` is the single seam that will read the field when the node-semantics campaign lands it.

## Outcome

Edges among the kept nodes are returned as arcs with their real relation, tier, and confidence, and a `None` derivation that serializes away until the field ships. Verified by `arcs_carry_relation_tier_confidence_and_a_graceful_derivation_fallback`.

## Notes

Confirmed by grep that no `derivation` field exists on `Edge` in `engine-model` today, matching the ADR's parent-feature-stability constraint; the fallback is the mitigation that keeps the build off the node-semantics critical path.
