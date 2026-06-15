---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S07'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace node-visual-richness with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The mirror the per-type status in the mock engine and the corpus fixtures and ## Scope

- `frontend/src/testing/mockEngine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# mirror the per-type status in the mock engine and the corpus fixtures

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Add per-type status tables to the corpus fixture mirroring the live engine mapping (adr decision states, plan tiers, audit severities, rule states, feature lifecycle) and emit `status_value`/`status_class` on the feature node, each doc node, and a new per-feature rule node.
- Cycle the tables by feature index so the full stamp matrix is exercised: an accepted ADR, a deprecated/superseded reading, an L2 plan, a high audit, and a superseded rule all appear.
- Verify the mock serves the fields unchanged through its document-granularity spread; extend the live-adapter survival test to assert the status fields survive the client path and that a type with no status machine carries neither field.

## Outcome

The mock now serves the additive status pair byte-for-byte with the live wire, and the adapter survival test proves the fields reach the client through the same path the app uses. No existing mock/stores/scene assertion broke.

## Notes

A dedicated rule node per feature was added (the prior corpus had no rule doc type) so the compound superseded-rule treatment is reachable; its declared edge carries a `binds` derivation and does not perturb the semantic-tier meta-edge derivation.
