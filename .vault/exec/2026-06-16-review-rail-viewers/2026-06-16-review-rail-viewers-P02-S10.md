---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S10'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Expose a content selector that derives degraded/offline state from the tiers block, never from a transport error and ## Scope

- `frontend/src/stores/server/selectors.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Expose a content selector that derives degraded/offline state from the tiers block, never from a transport error

## Scope

- `frontend/src/stores/server/selectors.ts`

## Description

- Add the `ContentView` shape and `deriveContentView`/`useContentView` selector deriving degraded/offline state from the served `tiers` block (the structural tier the content read resolves through), reading the FRESH error envelope's tiers over a stale held-success block, never from a bare transport error.
- Distinguish a tiers-less transport fault (errored) from a tiers-bearing degradation (degraded), and blank the text while degraded/errored so a stale body is never shown as current.

## Outcome

The viewers read interpreted loading/degraded/errored/truncated/content state, never the raw tiers block.

## Notes

The plan named `selectors.ts` as the target file, but this codebase's settled convention places tiers-derived view selectors in `queries.ts` beside their query hook (per `useVaultTreeAvailability`, `deriveRagStatusView`, `derivePipelineStatusView`); no `selectors.ts` exists. The selector was placed in `queries.ts` to match that convention and the layer-ownership boundary, rather than introducing a divergent file.
