---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S14'
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
     The S14 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add a route test asserting the tiers block rides the lineage success envelope and ## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a route test asserting the tiers block rides the lineage success envelope

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Add `graph_lineage_carries_the_tiers_block_on_the_success_envelope`: build a fixture worktree with two dated lane-owning documents, query `GET /graph/lineage?scope&from&to`, and assert 200, that `data.nodes`/`data.arcs` ride the payload, and that the `tiers` block is present with `semantic.available == false` (present-only) and `declared.available` a boolean (truthful per scope).

## Outcome

A route test proves the per-tier `tiers` block rides the lineage success envelope and that semantic is reported excluded while declared stays truthful.

## Notes

The test derives expectations from the contract (tiers on success, present-only semantic), not from observed output; it exercises the real handler end-to-end through the bearer-gated router via `get_with_token`.
