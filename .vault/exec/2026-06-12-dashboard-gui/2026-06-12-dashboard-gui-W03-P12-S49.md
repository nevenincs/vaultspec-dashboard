---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S49'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# swap the mock engine for the live serve origin behind the env flag and verify contract shapes against the real API, requires the engine plan serve wave landed

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Implement the DF-6 token bootstrap on the GUI side: the Vite dev proxy
  injects the Authorization bearer from the engine's service file on every
  proxied request (read fresh per request - the token rotates), and the
  production transport carries the `vaultspec-token` meta tag the served
  shell injects. Verified live: 200 through the proxy, 401 direct
  unauthenticated.
- The env-flag swap itself was already structural (the mock dynamic-import
  is gated on `VITE_MOCK_ENGINE=1`); with the flag off the client now
  reaches the live origin authenticated in dev and prod.
- Verify contract shapes family-by-family against the running serve
  (engine started from the workspace binary; health, gating, and every
  routed family probed). The live origin settled several shapes
  differently from the illustrative contract; added
  `frontend/src/stores/server/liveAdapters.ts`, a TOLERANT anti-corruption
  layer (internal/mock shapes pass through unchanged): the `{data, tiers}`
  envelope unwrap (plus the events `payload` nesting), the flat workspace
  map (scope tokens are normalized worktree paths), the index-rollup
  status, the vocabulary wrapper, and stem-keyed vault-tree entries with
  client-side doc-type derivation. Adapters are unit-tested against
  samples captured from the live origin.

## Outcome

The same client code path serves both origins: all 218 tests green
(mock-backed suites unchanged), and live-origin reads verified for map,
status, filters, vault-tree, graph/query, nodes, and events through the
authenticated dev proxy. Gates green: typecheck, eslint, prettier,
production build.

## Notes

Capability-level DIVERGENCES surfaced by the verification, flagged to
team-lead, engine owners, and experience-architect - adapters do not paper
over these (loose-scoping stance):

- `/graph/asof` and `/graph/diff` parse `t`/`from`/`to` as git revisions
  only; millisecond timestamps are rejected, while the contract commits
  `t=<ts|sha>`. Live time travel (S34's driver passes ms) is blocked on
  reconciliation.
- No feature-node synthesis and no engine-aggregated meta-edges in
  `/graph/query` (every node kind is `document`): the live constellation
  degrades to the document graph, contradicting contract §4's
  constellation granularity.
- Query nodes carry `title: null` and no lifecycle/dates/degree fields
  (degree_by_tier exists only in the node-detail bundle); node detail
  nests under `detail.bundle` with `edges_by_tier`.
- `/status` serves no git block (the now strip's git card renders the
  honest down state) and `/vault-tree` serves no dates (freshness blank)
  and no doc_type (derived client-side from the stem suffix).
- Commit events carry every touched file in `node_ids` (hundreds of
  `code:` ids per commit), which overloads the cross-highlight pulse.

S50's smoke (constellation render, scrub, search round-trip) can verify
render and search against the live origin but NOT scrub until the
asof/diff divergence is reconciled - flagged before starting S50.
