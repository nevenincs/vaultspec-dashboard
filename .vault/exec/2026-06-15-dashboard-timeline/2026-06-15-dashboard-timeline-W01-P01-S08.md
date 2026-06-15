---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S08'
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
     The S08 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Register the lineage projection module in the engine-query crate root and ## Scope

- `engine/crates/engine-query/src/lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Register the lineage projection module in the engine-query crate root

## Scope

- `engine/crates/engine-query/src/lib.rs`

## Description

- Registered the new `lineage` module in the engine-query crate root (`lib.rs`), alongside the existing `pipeline` module that S01 extended.
- The public projection fn `lineage::lineage` and the payload types (`LineageSlice`, `LineageNode`, `LineageArc`, `LineageTruncated`, `LineageTiers`) and the `MAX_DOCUMENT_NODES` ceiling are exported through the module path for the W01.P02 route to consume.

## Outcome

The lineage projection and its types are reachable from the crate root. The crate builds and all 40 engine-query unit tests pass, plus the bridge integration test.

## Notes

The `pipeline` module was already registered; S08 added only the `lineage` module declaration. The `PipelineLanePhase` enum and `phase_for_doc_type` from S01 are re-exported transitively via the public `pipeline` module.
