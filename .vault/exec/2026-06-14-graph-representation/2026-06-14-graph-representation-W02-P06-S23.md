---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S23'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Add a CPU UMAP-lite projection over embeddings with connectivity fallback for embeddingless nodes

## Scope

- `frontend/src/scene/field/semanticLayout.ts`

## Description


## Outcome

Added `semanticLayout.ts`: a torch-free deterministic linear DR projection (PCA via power iteration over the embedding covariance) with a connectivity-fallback ring for embeddingless nodes, drawn honestly aside.

## Notes

