---
tags:
  - '#exec'
  - '#agent-wire-gaps'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S24'
related:
  - "[[2026-07-17-agent-wire-gaps-plan]]"
---

# Add session_id, run_id, and turn_id optional fields to ProposalProjection, exposing the session_id the changeset revision already stores internally

## Scope

- `engine/crates/vaultspec-api/src/authoring/projections/mod.rs`

## Description

- Added `session_id: Option<SessionId>`, `run_id: Option<RunId>`, and
  `turn_id: Option<String>` to `ProposalProjection`, each `#[serde(default,
  skip_serializing_if = "Option::is_none")]` so an unstamped (human/direct) proposal
  omits the fields from the wire shape entirely rather than serving explicit `null`s.
- Populated all three from the changeset's ORIGIN revision (`origin.session_id`,
  `origin.run_id`, `origin.turn_id`) at projection build time — the origin revision is
  the one the run/turn provenance is stamped onto at creation (`S23`), so a projection
  built from a later revision (e.g. after a superseding edit) still reports the
  changeset's true originating fact.
- Added a dedicated projection test proving both halves: a tool-dispatched changeset's
  projection serves the stamped `session_id`/`run_id`/`turn_id`, and a human/direct
  changeset's projection serves `run_id`/`turn_id` as `None` with those two keys
  absent from the serialized JSON (not `null`).

## Outcome

A consumer reading `ProposalProjection` can now trace a proposal to the exact
session, run, and turn that produced it, with an honest absence (not a null) for
proposals that never carried that provenance.

## Notes

Landed at commit `145d699f96` ("serve session/run/turn provenance on
ProposalProjection from the origin revision"). The plan step's own scope names
`engine/crates/vaultspec-api/src/authoring/api/mod.rs`; the actual change landed in
`authoring/projections/mod.rs` — `ProposalProjection` and its builder live there, not
in `api/mod.rs`, so the plan's file path is a drafting inaccuracy against the current
module layout, not a scope miss. Independently reran
`cargo test -p vaultspec-api --lib -- authoring::projections::tests::proposal_projection_serves_origin_run_provenance_and_none_for_human`
— 1/1 passed — and the full `vaultspec-api` lib suite — 823/823 passed. This record
was authored during a fill pass (bookkeeping only, no code changes by me); the plan
tick already landed at `f7bdf28278`.
