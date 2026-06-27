---
tags:
  - '#exec'
  - '#rag-affordance-adoption'
date: '2026-06-27'
modified: '2026-06-27'
step_id: 'S04'
related:
  - "[[2026-06-27-rag-affordance-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-affordance-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-06-27-rag-affordance-adoption-plan placeholders are machine-filled by
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
     The Detect an older rag rejecting --json on the spawn path and retry the start without it and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Detect an older rag rejecting --json on the spawn path and retry the start without it

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Added `rag_rejected_json` (a non-zero exit whose combined output contains "no such option" + "--json" = an older rag rejecting the flag) and, in `start_rag_service`'s spawn path, a retry of the plain start (args minus `--json`) when it fires.

## Outcome

The adoption is version-tolerant: against a rag that predates the JSON-start contract, the start retries without `--json` and continues with today's logic - so the change is safe to merge against any rag version, no cross-repo release ordering.

## Notes

A false negative leaves a genuine failure (already failing); a false positive retries once and reaches the same failure - both converge to today's outcome.
