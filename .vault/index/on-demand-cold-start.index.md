---
generated: true
tags:
  - '#index'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - '[[2026-07-12-on-demand-cold-start-S01]]'
  - '[[2026-07-12-on-demand-cold-start-S02]]'
  - '[[2026-07-12-on-demand-cold-start-S03]]'
  - '[[2026-07-12-on-demand-cold-start-S04]]'
  - '[[2026-07-12-on-demand-cold-start-S05]]'
  - '[[2026-07-12-on-demand-cold-start-adr]]'
  - '[[2026-07-12-on-demand-cold-start-plan]]'
  - '[[2026-07-12-on-demand-cold-start-reference]]'
---

# `on-demand-cold-start` feature index

Auto-generated index of all documents tagged with `#on-demand-cold-start`.

## Documents

### adr

- `2026-07-12-on-demand-cold-start-adr` - `on-demand-cold-start` adr: `Constellation-first cold start: MBs load on demand, enrichment arrives behind a fast first paint` | (**status:** `accepted`)

### exec

- `2026-07-12-on-demand-cold-start-S01` - Build useProgressiveGraphSlice: wrap useGraphSlice so a live, cold, document-granularity request serves the same-identity feature-LOD slice as held data (isPending masked) until the document slice lands
- `2026-07-12-on-demand-cold-start-S02` - Consume the progressive hook in Stage in place of the raw slice hook, unchanged scene contract
- `2026-07-12-on-demand-cold-start-S03` - Yield briefly between vault-tree continuation pages so the background drain never contends with first paint or first interaction
- `2026-07-12-on-demand-cold-start-S04` - Test the progressive slice (cold fill, passthrough on data, asOf bypass, refreshing availability during fill) and the paced drain
- `2026-07-12-on-demand-cold-start-S05` - Run the full gate, live-verify cold-start payloads and first paint, review the diff, commit

### plan

- `2026-07-12-on-demand-cold-start-plan` - `on-demand-cold-start` plan

### reference

- `2026-07-12-on-demand-cold-start-reference` - `on-demand-cold-start` reference: `cold-start payload census`
