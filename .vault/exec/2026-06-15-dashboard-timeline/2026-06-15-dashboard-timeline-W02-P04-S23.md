---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
body_hash: 'sha256:d40a50fccd316b6c3c47872b296c7779b088673691fa4483e626db75ffa4e9a1'
step_id: 'S23'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

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
