---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:a2868cb9343bfabdf6ea63fc04edf3ef22f02d9ac1fa19c916e701d63f2d9e04'
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
