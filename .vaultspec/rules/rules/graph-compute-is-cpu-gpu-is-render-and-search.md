---
name: graph-compute-is-cpu-gpu-is-render-and-search
---

# Graph compute is CPU; GPU is rendering and search

## Rule

The `vaultspec` engine's graph compute — construction, diffing, projection, and
query in the `engine/` Rust crates — stays CPU-bound. GPU acceleration belongs
only to rendering (PixiJS in `frontend/src/scene/`) and semantic search
(vaultspec-rag, reached over its loopback HTTP service). Scale to millions of
nodes is won by linear ingest, bounded payloads, LOD-by-default, and memoized
projections — never by moving the graph engine onto a GPU.

## Why

The graph engine's work is branchy, pointer-chasing, data-dependent computation
over a per-scope node set held in RAM (`HashMap` adjacency); a GPU serves that
poorly and would be slower and far more fragile. The
`2026-06-13-graph-scale-hardening` cycle proved the real levers are algorithmic:
the cold index went from ~O(N²) to linear (601s → 2.1s at 4000 docs, 286×) by
building the resolver inventory once instead of per document, and the wire was
bounded by an LOD default plus a document node ceiling — no GPU involved. The
constraint matters because the initiative was framed as wanting a "fully
GPU-backed graph API"; that is a category error, and codifying the boundary
stops a future agent (or a future framing) from spending effort GPU-ifying the
CPU engine.

## How

- **Good:** a graph query feels slow at scale → profile for super-linear
  algorithms (per-item rescans, unmemoized projections), bound the payload (LOD
  default, pagination, node ceiling), and memoize derived projections on the
  immutable graph generation. Measure with the engine `scale_bench`.
- **Good:** rendering a million-node field is slow → that is the GPU's job, in
  the scene layer (instancing, culling, semantic-zoom LOD); the engine still
  serves a bounded LOD slice.
- **Bad:** proposing to compute graph layout, diffs, or projections on the GPU
  inside `engine/` "to make the graph API GPU-backed" — wrong layer, wrong tool;
  the engine holds no layout coordinates and its compute is not GPU-shaped.

## Status

Active. Established and measured in the `2026-06-13-graph-scale-hardening` cycle
(ADR decision D5). The boundary is also enforced structurally: the engine crates
carry no CUDA/torch/wgpu dependency, and rag (the GPU search sibling) is reached
only over HTTP.

## Source

ADR `2026-06-13-graph-scale-hardening-adr` (D5) and research
`2026-06-13-graph-scale-hardening-research` (findings F1, F3, F5). Sibling rules
`graph-queries-are-bounded-by-default`, `published-wheel-purity`,
`engine-read-and-infer`.
