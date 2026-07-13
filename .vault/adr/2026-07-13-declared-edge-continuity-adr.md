---
tags:
  - '#adr'
  - '#declared-edge-continuity'
date: '2026-07-13'
modified: '2026-07-13'
related:
  - '[[2026-07-13-graph-slice-delta-adr]]'
---

# `declared-edge-continuity` adr: `stale-while-refolding declared edges` | (**status:** `accepted`)

## Problem Statement

Live incident (2026-07-13): a continuously-edited 8,700-document corpus presents a graph with ZERO edges, permanently. The declared (`related:` frontmatter) edges are folded into the graph AFTER every rebuild by a coalesced background task that reads the corpus through a `vaultspec-core` subprocess, keyed on the corpus-content fingerprint. Every edit invalidates that key and a rebuild wipes the graph's declared edges, so under a steady edit tempo the fold never completes before the next rebuild — the served graph carries nodes only, the declared tier reads "building" forever, and the canvas shows an unexplained edge-less constellation. The user experiences a non-functional graph. The same perpetual-building state was the driver of the (now fixed) refetch storm.

## Considerations

- The previous fold's edges are a RECENT truth: declared edges change only when a document's frontmatter `related:` changes, a small fraction of edits. Serving the last completed fold's edges while the next fold runs is almost always exactly correct, and the fold's own completion converges any difference.
- Present-view consistency (graph rules): a carried edge whose endpoint document was REMOVED in the rebuild would violate slice self-consistency; carried edges must be pruned against the rebuilt node set.
- Honesty: the tiers block must distinguish edges present-but-refreshing from edges absent (first fold, no prior truth), so the UI can message each truthfully.
- The fold already emits deltas on completion; carrying edges forward means the completion diff is computed against the carried state, naturally shrinking the emitted burst.

## Considered options

- **Block the rebuild on the fold** — serializes ingest behind a subprocess; a slow core read would stall live updates. Rejected.
- **Status quo** — edge-less graphs under churn, permanent "building". Rejected by incident.
- **Carry the last completed fold's edges into the rebuilt graph, pruned (CHOSEN)** — the rebuild grafts the previous declared edge set onto the fresh graph, dropping any edge whose endpoint no longer exists; the running fold replaces them on completion; the tier reports refreshing instead of bare building when a carry happened.

## Constraints

- The carried set lives on the scope cell and is replaced only by a COMPLETED fold, never partially; it is bounded by the corpus's own edge count (no new unbounded accumulator).
- A first-ever fold (no prior truth) still serves node-only with the honest building reason — carrying nothing is correct there.
- Edge stable keys are identity-bearing (wire contract): carried edges keep their keys verbatim; pruning never rewrites a key.
- The fold's completion diff must be computed against the graph AS SERVED (with carried edges), so clients receive exactly the correction, never a full re-add.

## Implementation

- The scope cell retains the last completed fold's declared edge set, `Arc`-shared with the graph that carried it. The rebuild path grafts it onto the freshly-built graph before the swap, pruning edges whose src/dst node is absent from the new node set; the generation bump and emitted diff then already include the carried edges.
- The declared tier's reason distinguishes building (no prior fold — edges absent) from refreshing (carried edges served; fold updating them). The wire keeps `available: false` in both cases with the reason string carrying the distinction, so existing consumers degrade identically while the UI messages precisely.
- The fold's completion path replaces the carried set, computes its delta against the served carried state, and flips the tier to available — otherwise unchanged.
- Frontend messaging (companion chrome change, same feature): the canvas banner renders the two states distinctly — "Document links are being refreshed" (edges visible) vs "Document links are loading for the first time — nodes are shown; links appear when ready" (edge-less) — replacing the opaque "Still loading links…".

## Rationale

Carried edges turn the fold from a gate into a refresher: the graph is always as correct as the last completed truth, converging to exact within one fold latency, and the UI never presents an inexplicable edge-less corpus. Pruning against the rebuilt node set preserves slice self-consistency; honest tier reasons preserve degradation truth.

## Consequences

- A corpus under continuous editing shows near-current edges at all times; the permanent edge-less state disappears.
- A stale edge can persist up to one fold latency after a `related:` removal — bounded, honest (tier reads refreshing), converged by the completion delta.
- The carried set is one more retained structure per cell, bounded by corpus edge count and `Arc`-shared.
- The "Still loading links…" banner becomes two precise, plain-language states.
