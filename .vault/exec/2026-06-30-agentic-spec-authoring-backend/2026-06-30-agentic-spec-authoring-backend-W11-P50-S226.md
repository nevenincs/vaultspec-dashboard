---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S226'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Per-document activity and count projections requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Re-read the binding W11.P50 plan rows after W11.P34 closure.
- Ground the phase against the accepted changeset-ledger ADR, review-station-state ADR, streaming-events/outbox ADR, Increment 3 reference, and current `projections.rs`.
- Use `vaultspec-rag` to locate the governing projection requirements and the current projection implementation.
- Dispatch a read-only review sidecar to challenge the checklist before S227 implementation.
- Record the implementation, test, review, and verification checklist for S227 through S230.

## Outcome

W11.P50 is the Increment 3 remainder for backend-served review count rollups and
per-document activity projections. It must extend the existing durable projection
surface rather than deriving state from frontend code, stream events alone, or
the bounded proposal-list page.

Key scope decisions:

- Counts are fixed-cardinality aggregate buckets over the full durable corpus.
  They must not be computed from `ProposalListProjection.items`, because that
  list is intentionally bounded and may be truncated.
- Per-document activity is a bounded feed over durable changeset child targets,
  not an unbounded all-document attachment to the proposal list.
- Projections remain rebuildable pure reads over durable ledger, approval,
  validation, preimage, mode, and outbox-backed state. No stored projection cache
  becomes authority in this phase.
- Activity grouping must use stable document identity from `DocumentRef`, not a
  mutable path alone. Existing documents should group by stable scope/node
  identity, provisional creates by provisional id, renames by reviewed/source and
  proposed identities as explicitly chosen in S227, and materialized results by
  the reviewed document identity unless S227 records a stronger reason to split.
- Activity ordering should use durable ledger sequence or another monotonic
  durable sequence with explicit tie-breaks, not only caller-supplied
  `created_at_ms`.

`S227` implementation checklist:

- Add projection DTOs in `projections.rs` for corpus review counts and
  per-document activity pages.
- Count canonical changeset statuses across the full changeset corpus before any
  page limit is applied.
- Count review queue states where approval state matters: `queued`, `claimed`,
  `decision_submitted`, and `closed`.
- Keep counts fixed-size and honest; no count may depend on a bounded list of
  projected proposal rows.
- Add a bounded per-document activity feed with `items`, `cap`, and `truncated`.
- Normalize document identity explicitly for every `DocumentRef` variant the
  current authoring model supports.
- Build activity items from durable child-operation and projection data:
  document identity, changeset id/revision, status, queue/approval state,
  actor/origin actor, summary, conflict/stale flags, validation state, and
  rollback availability where relevant.
- Prefer targeted repository reads over unbounded in-memory scans. If a full
  durable scan is unavoidable for the first implementation, bound the served
  feed, document the corpus-scan tradeoff, and keep fixed-count rollups honest.
- Decide whether counts live on `ProposalListProjection` and whether
  per-document activity gets a separate projection function/route. Avoid putting
  all-document activity on the proposal list response.
- Ensure recovery snapshots that embed proposal-list state remain consistent if
  counts are added to that projection contract.

`S228` test checklist:

- Use real `Store`, ledger rows, approval rows, validation rows, and document
  refs; do not use fakes, mocks, stubs, monkeypatches, skips, or xfails.
- Prove full-corpus counts are not derived from the bounded proposal list by
  seeding more than `MAX_PROJECTION_PROPOSALS` changesets and asserting counts
  cover rows beyond the returned page.
- Cover status-bucket transitions for draft/review/approved/applying/applied and
  terminal statuses where represented by current helpers.
- Cover queue-state buckets for queued, decision-submitted, and closed approvals;
  claim coverage should be added if the current claim store is implemented.
- Cover per-document grouping for repeated edits to one document,
  multi-child changesets, provisional creates, and rename/materialized result
  identity decisions.
- Cover bounded activity truncation with deterministic ordering by durable
  sequence and explicit tie-breaks.
- Cover restart/reopen rebuild of counts and activity from durable rows.
- Cover route or recovery snapshot behavior if S227 exposes counts/activity on
  an HTTP response.

`S229` review checklist:

- Review that counts are backend-served full-corpus rollups and never frontend or
  bounded-page derivations.
- Review SQL/resource bounds, indexes, and any corpus-scan tradeoffs.
- Review document identity normalization for mutable-path and rename pitfalls.
- Review that activity item fields remain projection data and do not smuggle raw
  document bodies or token/generation data.
- Review that recovery/stream semantics are not treated as the source of
  projection truth.

`S230` verification checklist:

- Verify counts and per-document activity rebuild after store restart/reopen.
- Verify counts stay correct when the proposal list is truncated.
- Verify per-document activity ordering and truncation are stable and honest.
- Verify served HTTP/recovery surfaces, if changed by S227, carry shared `tiers`
  through existing envelope helpers.
- Verify W11.P50 leaves frontend cursor streaming and generation-channel
  compaction to W11.P51 and W12.P44 respectively.

## Notes

- Current `projections.rs` already documents the W11.P50 gap: counts and
  per-document activity were deferred because computing counts from a bounded
  proposal page would be false.
- Sidecar reviewer `019f3885-981f-7673-b966-dee4ea92c75c` identified the main
  risks to carry into S227: avoid page-derived counts, avoid path-only document
  grouping, avoid timestamp-only ordering, and be explicit if current schema
  requires a bounded scan tradeoff.
- `projections.rs` is already modified in the shared worktree by prior W10 work;
  S226 did not edit it.
