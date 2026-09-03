---
tags:
  - '#audit'
  - '#a2a-orchestration-edge'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:4f82a074a3ffa3c6c9936491eb6d6af389341fe89659a5f4fa30a49be948c259'
related:
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
---

# `a2a-orchestration-edge` audit: `provider catalog consumer shipped ahead of its producer`

## Scope

Evidence write-up of the provider-catalog edge state at dashboard `HEAD`
(2026-08-02), requested by the review router so the owning lane can act on
verified fact rather than a second-hand summary. Both repositories were read at
source; nothing here is inferred from behaviour alone, and nothing was changed.
This documents WHAT breaks, WHEN, and FOR WHOM. It proposes no fix and makes no
decision.

## Findings

### catalog-consumer-inversion | critical | every brokered run-start is refused by the sibling at current heads

The failure is not limited to the dead catalog read; the start path itself is
broken end to end. Engine commit `12f7de9796` (2026-08-02 08:29) made a served
selection MANDATORY on the brokered `run-start`: absent `selection`, the engine
itself refuses with "run-start requires an A2A-served `selection`"
(`engine/crates/vaultspec-api/src/routes/ops/a2a/validate.rs:183`). When a
selection IS supplied, the engine forwards it in the run-start body
(`engine/crates/vaultspec-api/src/routes/ops/a2a.rs:466`). The sibling's
`RunStartRequest` declares `extra="forbid"` and has no `selection`, `overrides`,
or `fallbacks` field anywhere in its schema (a2a repository,
`src/vaultspec_a2a/api/schemas/gateway.py:197`; confirmed by full-schema
search), so every forwarded start body is refused with a validation error.
Consequence: with an engine built at or after `12f7de9796`, NO A2A run can be
started through the broker — with or without a selection, for every preset,
deterministic or live. The chrome is on the same chain: the composer carries a
`ProviderCatalogSelection` and its render test asserts the run-start body
carries `selection` (`frontend/src/app/agent/Composer.tsx:580`,
`frontend/src/app/agent/Composer.feature.render.test.tsx:282`), and the stores
payload declares `selection` as a required field
(`frontend/src/stores/server/agent/a2aTeam.ts`, `TeamRunStartPayload`).

### catalog-read-unserved | high | the whitelisted catalog verb forwards to a route the sibling does not serve

The same commit added `provider-catalog` to the fixed verb whitelist,
forwarding to `/v1/provider-catalog`
(`engine/crates/vaultspec-api/src/routes/ops/a2a.rs:61` and `:132`). The
sibling serves no such route: it appears nowhere in the a2a gateway's route
modules or in its committed OpenAPI artifact (a2a repository, `openapi.json`,
full-text search). A client exercising the verb receives the sibling's 404
forwarded through the edge; the composer's model picker therefore can never
populate, which also forecloses the only sanctioned way to obtain the
selection the run-start above requires.

### catalog-producer-in-flight | medium | the producer exists only as an in-flight sibling plan

The producer side is real but unfinished: the a2a repository's accepted
`2026-08-02-provider-model-catalog-adr` decides provider-owned catalogs, and
its plan stood at 8 of 21 steps (next `P01.S06`) when this audit was taken,
with catalog adapter modules present (`src/vaultspec_a2a/providers/*_catalog.py`)
but no serving route and no run-start schema extension. The engine consumer
therefore anticipates a contract whose producer milestones are not yet reached,
inverting the producer-first ordering the edge discipline requires.

### catalog-event-unrecorded | medium | the widening carries no record on the consuming side

`12f7de9796` added an eighth whitelisted verb and made run-start's body
requirements strictly harder — a contract event on the frozen edge — with no
amendment on `2026-07-14-a2a-orchestration-edge-adr` (every prior widening
carries one), no commit trailer, and no governing dashboard-side record found
anywhere in the vault (full-text search for the verb and the selection
contract). Code and record currently disagree about the edge's verb count and
about run-start's required body.

### catalog-exposure-window | low | the breakage binds on next build, not on running instances

Deployed instances built before `12f7de9796` are unaffected; the seated
engine's binary predates it. The failure surfaces for whoever next rebuilds or
restarts an engine from current main and attempts any run-start — including
this repository's own live-engine test harness, whose vitest global setup
boots a freshly built engine.

## Recommendations

For the owning lane, in evidence order, decision theirs: either the sibling's
catalog serving route and run-start selection acceptance land before any
engine built from current main reaches use (producer-first, restoring the
ordering), or the engine's selection requirement is temporarily relaxed to
optional-and-forwarded-when-present until the producer serves, so run-start
works against the sibling that exists. Whichever is chosen, the edge record
needs the missing amendment for the eighth verb and the run-start body change;
an unrecorded contract event on a frozen edge is a defect independent of the
inversion. The a2a-side closed-set v1 route guard and the cross-repository
bounds-agreement suite are the natural places to pin the eventual
producer/consumer agreement so this class of inversion fails a test instead of
a user.
