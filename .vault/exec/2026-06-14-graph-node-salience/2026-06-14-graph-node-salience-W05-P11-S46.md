---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S46'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace graph-node-salience with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S46 and 2026-06-14-graph-node-salience-plan placeholders are machine-filled by
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
     The Add a degraded-tier integration test asserting salience computed over available tiers is flagged partial in the tiers block end to end and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a degraded-tier integration test asserting salience computed over available tiers is flagged partial in the tiers block end to end

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

Added the degraded-tier integration test (salience_routes.rs degraded_tier_flags_salience_partial_end_to_end): forcing the declared backbone tier degraded makes /graph/query report salience_partial=true for the SAME state the tiers block reports, with the ranking still served over available tiers (read from tiers, never guessed). Green.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
