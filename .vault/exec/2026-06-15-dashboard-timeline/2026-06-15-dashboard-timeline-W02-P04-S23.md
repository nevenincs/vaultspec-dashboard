---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S23'
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
     The S23 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Make mockEngine serve the exact lineage wire shape with derivation-fallback edges and ## Scope

- `frontend/src/testing/mockEngine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Make mockEngine serve the exact lineage wire shape with derivation-fallback edges

## Scope

- `frontend/src/testing/mockEngine.ts`

## Description

- Add a `/graph/lineage` route to the mock engine serving the exact live wire shape: dated, lane-owning document nodes in the `[from, to]` ISO range with derived phase, blob-true dates, title, and degree, plus the self-consistent arcs among only the kept nodes.
- Add the `lineagePhaseForDocType` mapping byte-for-byte from the engine `phase_for_doc_type` (research/reference→research, adr→adr, plan→plan, exec→exec, audit→review, rule→codify; commit/index/unknown→none).
- Emit derivation-FALLBACK arcs (no `derivation` field) drawn from the corpus's real relation/tier edges, and convert the corpus's ISO `modified` string to an epoch-ms NUMBER to match the live `Timestamp`.
- Mark the envelope `tiers` block's semantic tier present-only (excluded from the range lineage), mirroring the live `degraded_tiers` overlay.

## Outcome

The mock serves the exact live shape, including the self-consistency invariant (every arc's src/dst is a returned node) and the bounded/honest `truncated` (null on the small corpus). The numeric `modified` conversion is the deliberate fidelity fix: a string here would be a mock-vs-live divergence.

## Notes

The corpus's lifecycle and semantic edges are doc-to-doc, so real arcs survive self-consistency; declares edges (doc-to-feature) are correctly dropped since feature nodes are not lineage nodes.
