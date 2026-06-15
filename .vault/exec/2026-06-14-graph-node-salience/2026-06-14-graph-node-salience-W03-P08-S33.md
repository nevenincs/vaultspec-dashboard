---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S33'
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
     The S33 and 2026-06-14-graph-node-salience-plan placeholders are machine-filled by
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
     The Flag salience partial via the tiers block when a tier is degraded, computing over available tiers and never presenting a guessed-complete score and ## Scope

- `engine/crates/engine-query/src/salience.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Flag salience partial via the tiers block when a tier is degraded, computing over available tiers and never presenting a guessed-complete score

## Scope

- `engine/crates/engine-query/src/salience.rs`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

Flag salience partial via is_partial read from the tiers block (degradation-is-read-from-tiers): a degraded backbone tier (declared/structural) flags any lens partial; a degraded temporal tier flags the status lens partial. The route surfaces salience_partial in the response, computing over available tiers and never presenting a guessed-complete score.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
