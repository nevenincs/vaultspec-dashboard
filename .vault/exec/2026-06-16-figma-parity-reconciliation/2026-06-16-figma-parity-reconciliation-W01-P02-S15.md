---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S15'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S15 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Carry the tiers degradation block on the historical text-diff route success and error envelopes through the shared helper and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Carry the tiers degradation block on the historical text-diff route success and error envelopes through the shared helper

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Confirm and document that the historical-diff route constructs its success body through the shared `envelope` helper (which attaches the per-tier degradation block) and degrades every error path through `api_error` (which always attaches the tiers block), so tiers ride on both success and error envelopes.
- Add a dedicated test asserting the tiers block is present on the historical-diff SUCCESS envelope and on the ERROR envelope (a missing rev is a tiers-bearing 400 before any subprocess).

## Outcome

The bounded historical text-diff route carries the tiers degradation block on both its success and error envelopes through the shared envelope helper, with no hand-built response body. The dedicated test proves both paths. `cargo fmt --check` and `cargo clippy -D warnings` are clean on the touched crate.

## Notes

The tiers carriage is structural: the route shares the single `envelope`/`api_error` construction every front door uses, so it cannot ship a tiers-less body. The route logic landed in S14; this Step closes the tiers obligation and its verification.
