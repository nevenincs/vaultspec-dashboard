---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S31'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement blob-true as-of graph reconstruction reading document blobs as committed at T from the git object DB

## Scope

- `engine/crates/engine-graph/src/asof.rs`

## Description

- Implement blob-true as-of reconstruction: enumerate the committed tree at T via gix, read document blobs as committed (never the present working tree), rebuild document nodes and structural edges with tree-based resolution against the inventory at T.
- Share the structural edge constructor with the present-tree index path so identical content mints identical edge identities across present and historical views.
- Semantic tier excluded by construction - nothing in the module can mint a semantic edge (D7.3/D3.5).

## Outcome

The playhead's data path: a divergence test proves the T1 view reports the T1 mention resolved against the T1 tree while the present tree says otherwise.

## Notes

v1 as-of bound: step-id and symbol mentions mark STALE at T (verifying them blob-true requires plan/code blob scans); paths and wiki stems resolve fully. Target-node materialization deliberately mirrors the present-tree index path (none at ingestion) - a P08 concern, noted there.
