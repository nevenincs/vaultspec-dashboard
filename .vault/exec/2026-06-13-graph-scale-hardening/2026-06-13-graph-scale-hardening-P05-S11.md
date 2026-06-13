---
tags:
  - '#exec'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S11'
related:
  - "[[2026-06-13-graph-scale-hardening-plan]]"
---

# Codify the GPU-boundary and bounded-query rules as project rules

## Scope

- `.vaultspec/rules/rules`

## Description

- Authored two project rules under `.vaultspec/rules/rules/` and propagated them
  with `vaultspec-core spec rules sync`:
  - `graph-compute-is-cpu-gpu-is-render-and-search` — the engine's graph compute
    stays CPU; GPU is rendering (PixiJS) and search (rag); scale is won by linear
    ingest, bounded payloads, and LOD, never by GPU-ifying the engine.
  - `graph-queries-are-bounded-by-default` — every graph read is bounded: LOD
    default, document node ceiling with a self-consistent truncated subgraph and
    honest `truncated` block, scoped descent; no unbounded full-document slice on
    the wire.

## Outcome

Both rules register (`vaultspec-core spec rules list` shows them as Custom) and
synced to every provider rules directory (8 copies created). Future agents
inherit both disciplines on session load, across clones and CI.

## Notes

These satisfy the codify bar: cross-session, constraint-shaped, project-bound,
and held across the full `graph-scale-hardening` execution cycle (every measured
win was CPU-algorithmic + bounding). The GPU-boundary rule is especially load-
bearing because the initiative was framed as wanting a "fully GPU-backed graph
API" — codifying the boundary prevents that category error from recurring. Both
name the ADR/research stems as their source.
