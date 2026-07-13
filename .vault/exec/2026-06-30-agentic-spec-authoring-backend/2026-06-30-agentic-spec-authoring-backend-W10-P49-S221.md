---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S221'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Unified write path: direct-changeset dual-run for the editor save requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Run `vaultspec-rag` semantic discovery over the accepted operation-modes ADR,
  rollout reference, current plan rows, W10.P48 execution records, legacy
  `/ops/core` write broker, authoring approval path, apply path, core adapter,
  snapshot/preimage store, and frontend editor write seams.
- Re-read the binding `W10.P49` plan rows after W10.P48 was completed and
  summarized.
- Cross-check the direct editor-save requirement against the current Rust
  implementation seams: `ops_core_write`, `CoreWriteBody`,
  `CoreInvocation::write`, `apply_changeset`, `automated_self_approval_blocker`,
  `mode_after_submit`, `materialize_drafts`, `store_preimages`,
  `SnapshotReader::capture_preimage`, and the frontend `opsCoreWrite`/editor
  save hooks.
- Convert the accepted unified-write-path requirements into the checklist for
  `S222`, `S223`, `S224`, and `S225`.

## Outcome

`W10.P49` is the transition-state half of the unified write path. The end state
is that a human editor save is a ledgered `kind=direct` changeset with captured
preimage, child operation, human self-approval, normal apply, receipt, and
rollback availability. The transition state is narrower: land that direct path
behind a feature flag and dual-run it against the legacy `/ops/core` broker only
long enough to prove latency parity and conflict-UX parity. Broker retirement is
explicitly Increment 6, not this phase.

The phase must preserve the architecture boundary: the dashboard authoring
backend owns workflow state and the ledger, but it still materializes vault
documents only through the internal `vaultspec-core` adapter. The legacy broker
may remain live during dual-run, but no new collaborator-facing path should expose
core-shaped semantics beyond the existing transition surface.

The dual-run safety rule is load-bearing: one user save must not run two writing
materializers against the same live checkout and the same base hash. The
implementation must record which path is authoritative for the real worktree in
each flagged save. If the legacy broker remains authoritative, the direct path
may only record non-applied shadow/preflight evidence; it must not forge an
`Applied` ledger state. If the direct changeset path is authoritative, any
legacy comparison must be isolated, non-mutating, or otherwise incapable of
writing the same live checkout. This keeps parity measurement from creating the
very conflict or duplicate write it is meant to measure.

`S222` implementation checklist:

- Add `direct_write.rs` and export it through the authoring module. Keep the
  module as a composer over existing seams: document snapshot/preimage capture,
  changeset creation, validation/materialization records, approval decision,
  normal apply, and legacy broker comparison. Do not create a second
  materializer.
- Add the smallest model/API vocabulary needed for direct saves. Current
  `ChangesetKind` only has `Authoring` and `Rollback`, so implementation must
  either add a durable direct kind or a durable direct marker that projections,
  audit, rollback, and tests can distinguish from agent-authored proposals.
- Treat the authoring human as both origin author and reviewer for a direct save.
  Reuse the existing human self-approval carve-out; do not weaken the automated
  self-approval ban for agents or tool executors.
- Choose the actor-source seam explicitly. The legacy `/ops/core/*/write` route
  does not currently carry the authoring `ResolvedCommand` principal, so a
  dual-run hook there must be given a real authenticated human actor source, or
  the direct-save command must be exposed under `/authoring` and the frontend
  save path migrated to that route while the legacy route remains the measured
  comparator.
- Preserve the canonical lifecycle. A direct save still records a proposal or
  equivalent ledger revision, reaches `Approved` through a real approval record,
  enters `Applying`, completes as `Applied` or `Failed`, and records the normal
  apply receipt. No state skip, no direct store mutation, and no bypass of
  approval freshness or base-revision checks.
- Capture a preimage before materialization and store it in the existing snapshot
  store so the applied direct save can be shown in history and rolled back through
  the existing rollback path.
- Restrict the first direct path to the operations that current apply can really
  materialize. Today `apply_changeset` supports whole-document body replacement
  through `CoreCapability::SetBody`; frontmatter/edit/rename parity should be
  refused or kept behind explicit typed unsupported outcomes until the apply
  materializer supports them.
- Reuse the existing optimistic `expected_blob_hash` conflict behavior. A direct
  path conflict must surface the same business outcome as the legacy editor save,
  not a transport failure or a generic authoring error.
- Implement the feature flag as backend-owned configuration or scoped capability
  state. Do not bury an ad hoc environment read inside the write path. When the
  flag is off, the legacy `/ops/core` path remains the served editor behavior.
- In dual-run mode, preserve the user-visible legacy result while recording and
  comparing the direct path evidence when the legacy path is the authoritative
  writer. If the feature flag chooses the direct path as the authoritative writer,
  preserve the direct apply result and run legacy comparison only through an
  isolated or non-mutating seam. In both cases the comparison must capture the
  authoritative path, direct elapsed milliseconds, legacy elapsed milliseconds
  when measured, success/refusal status class, conflict/refusal shape, resulting
  blob hash when available, and enough redacted diagnostics to explain parity
  failures.
- Treat latency parity as recorded evidence in this phase, not a retirement
  threshold. `W14.P47` consumes the evidence before broker retirement; `S222` and
  `S223` must prove the evidence is captured and comparable without asserting a
  brittle unit-test timing ratio.
- Make dual-run idempotent. Retrying the same save command must not create
  duplicate ledger entries or apply twice; idempotency keys should bind the direct
  changeset creation, approval, apply, and parity evidence.
- Keep local unsaved drafts frontend-owned. Only a save command enters the
  ledger; typing buffers and draft text before save are out of scope.
- Keep legacy write-broker retirement out of this phase. This phase produces the
  evidence needed to retire it later.

`S223` test checklist:

- Prove a human direct save can self-approve legally and that the same origin
  human is recorded in the ledger and approval record.
- Prove an agent or tool executor cannot use the direct-save path to approve its
  own write.
- Prove a direct body save captures a preimage, records a child operation, applies
  through `apply_changeset`, records a receipt, and leaves rollback availability
  true for the applied row.
- Prove a stale `expected_blob_hash` returns conflict parity with the legacy
  broker and does not apply or mark the direct ledger entry as successful.
- Prove dual-run evidence records latency and result-shape comparison without
  leaking raw document body, raw stderr, or absolute host paths onto the wire.
- Prove a single save cannot apply through both materializers on the live
  checkout. The test should fail if both legacy and direct paths attempt to write
  the same base in the same request.
- Prove feature-flag off preserves the legacy `/ops/core` write behavior and does
  not create direct ledger records.
- Prove unsupported verbs or operation kinds are typed unavailable outcomes, not
  silent legacy-only successes.
- Prove route/store/frontend adapter tests consume backend-served parity/direct
  status rather than inferring direct-save state from core envelopes.

`S224` review checklist:

- Review that no collaborator payload can select a raw core capability or bypass
  the internal `CoreAdapter`.
- Review that idempotency spans create, approve, apply, and dual-run evidence.
- Review that conflict parity and latency measurements are real behavior tests,
  not tautological mirrors of expected values.
- Review that the human self-approval carve-out did not widen into automated
  self-approval.
- Review that the legacy broker is fenced as transition state and has a named
  retirement gate.

`S225` verification checklist:

- Run focused backend direct-write tests plus approval, apply, rollback,
  projection, and HTTP route tests that cover the direct path.
- Run frontend store/render tests for the editor save seam if the served wire
  shape changes.
- Run `cargo check` for `vaultspec-api` and `npm run typecheck`.
- Verify Increment 2 at the data-contract level: autonomous body edit still
  auto-applies, appears in the after-the-fact lane, rolls back, and a mode
  downgrade re-queues pending auto-approvals. Then verify a human editor save can
  dual-run as a direct changeset behind the flag, record parity evidence, and
  preserve the configured authoritative write result.

## Notes

`vaultspec-rag` found the governing decision in the accepted operation-modes ADR:
human saves become direct self-approved changesets in the end state, while the
current phase is only the evidence-gathering dual-run. The codebase is consistent
with that direction: W10.P48 already composes system auto-approval with the normal
apply command, `approvals.rs` already permits human self-approval while preserving
the automated self-approval ban, and `core_adapter.rs` already mirrors the legacy
write broker with typed capabilities.

Known implementation pressure points: current apply materialization only supports
whole-document body replacement, current `ChangesetKind` has no direct variant,
the legacy `/ops/core` route lacks the authoring command-principal middleware,
the accepted docs do not specify a single-request dual-run authority model, and
no obvious authoring feature-flag registry surfaced in the Rust API. `S222` must
resolve those narrowly rather than expanding this phase into broker retirement,
full frontmatter/edit/rename materialization, or frontend draft-room state.
