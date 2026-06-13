---
generated: true
tags:
  - '#index'
  - '#graph-scale-hardening'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - '[[2026-06-13-graph-scale-hardening-P01-S01]]'
  - '[[2026-06-13-graph-scale-hardening-P01-S02]]'
  - '[[2026-06-13-graph-scale-hardening-P01-S03]]'
  - '[[2026-06-13-graph-scale-hardening-P02-S04]]'
  - '[[2026-06-13-graph-scale-hardening-P02-S05]]'
  - '[[2026-06-13-graph-scale-hardening-P03-S06]]'
  - '[[2026-06-13-graph-scale-hardening-P03-S07]]'
  - '[[2026-06-13-graph-scale-hardening-P03-S08]]'
  - '[[2026-06-13-graph-scale-hardening-P04-S09]]'
  - '[[2026-06-13-graph-scale-hardening-P04-S10]]'
  - '[[2026-06-13-graph-scale-hardening-adr]]'
  - '[[2026-06-13-graph-scale-hardening-plan]]'
  - '[[2026-06-13-graph-scale-hardening-research]]'
---

# `graph-scale-hardening` feature index

Auto-generated index of all documents tagged with `#graph-scale-hardening`.

## Documents

### adr

- `2026-06-13-graph-scale-hardening-adr` - `graph-scale-hardening` adr: `graph API scale + UI backend performance architecture` | (**status:** `accepted`)

### exec

- `2026-06-13-graph-scale-hardening-P01-S01` - Thread a once-built worktree inventory into resolution
- `2026-06-13-graph-scale-hardening-P01-S02` - Build inverted indices once and resolve each mention by lookup
- `2026-06-13-graph-scale-hardening-P01-S03` - Re-run scale_bench and record the cold-index before and after, keeping resolver tests green
- `2026-06-13-graph-scale-hardening-P02-S04` - Memoize the derived projections and serialized slice on the graph generation, invalidated at commit
- `2026-06-13-graph-scale-hardening-P02-S05` - Re-run the scale_bench concurrent pass and record before/after
- `2026-06-13-graph-scale-hardening-P03-S06` - Default to LOD, finish cursor pagination, and enforce a hard node ceiling on document granularity
- `2026-06-13-graph-scale-hardening-P03-S07` - Add a viewport/region filter parameter to the document query
- `2026-06-13-graph-scale-hardening-P03-S08` - Amend the contract reference and add conformance assertions for the bounded-query semantics
- `2026-06-13-graph-scale-hardening-P04-S09` - Default the GUI graph query to the constellation LOD and descend to bounded slices on zoom-in
- `2026-06-13-graph-scale-hardening-P04-S10` - Re-run the frontend gates green (typecheck, lint, test, build)

### plan

- `2026-06-13-graph-scale-hardening-plan` - `graph-scale-hardening` plan

### research

- `2026-06-13-graph-scale-hardening-research` - `graph-scale-hardening` research: `graph API scale + UI backend performance`
