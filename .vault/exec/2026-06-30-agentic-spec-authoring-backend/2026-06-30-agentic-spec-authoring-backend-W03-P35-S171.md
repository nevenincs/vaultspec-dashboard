---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S171'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Core adapter capability registry requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Read the active `W03.P35` plan row and the rewritten rollout reference.
- Cross-check the accepted authoring boundary, apply materialization, and API
  contract ADRs against the existing Rust backend.
- Inspect the existing `/ops/core/*` broker and authoring operation DTOs to find
  reusable safety patterns and public-contract traps.
- Convert the ADR requirements into the phase checklist for `S172`, `S173`, and
  `S175`.

## Outcome

`S172` must implement a private authoring core adapter, not a new collaborator
API surface. The adapter belongs under `authoring::core_adapter` and may be used
by later authoring commands, but frontend stores and LangGraph tools must only
see semantic authoring commands such as proposal validation, apply requests, and
receipts. The existing `/ops/core/*` broker in `routes::ops` is a useful safety
analogue; it is not the authoring contract and must not be re-exported as one.

`S172` implementation checklist:

- Define backend-owned semantic capabilities, not caller-supplied core verbs.
  The walking-skeleton set is body edit, frontmatter edit, and document create,
  each with validation or dry-run and materialization modes where core supports
  them.
- Include the core validation or check capability needed by later apply and
  approval gates, but keep it private to the adapter and validation command
  path.
- Map capabilities to exact fixed `vaultspec-core vault` argv templates:
  `set-body`, `set-frontmatter`, and `add`. Later support for `edit`, `rename`,
  archive, link, section edits, or multi-child batch apply must be rejected with
  typed unsupported-capability results until the plan reaches those phases.
- Keep argument builders typed and value-only. Inputs such as document refs,
  expected blob hashes, feature tags, doc types, related links, titles, and
  frontmatter values must be validated before spawn, with no shell assembly and
  no arbitrary passthrough argument vector.
- Pin execution to the resolved project or scope root and the detected
  project-local core invocation. The capability registry must be the only layer
  that decides which core command may run for an authoring operation.
- Use the existing core runner detection behavior as the base for project-local
  invocation resolution, including safe stale or missing core failures.
- Run subprocesses with `tokio::process`, closed or piped stdin by capability,
  explicit wall-clock timeout, explicit stdout cap, stderr cap or discard policy,
  null stdin when no body is needed, UTF-8 environment for body stdin, and child
  kill on timeout or capped runaway.
- Parse status-bearing core envelopes without treating business refusals as
  transport faults. Conflicts, validation refusals, and dry-run failures should
  become typed adapter outcomes that later authoring commands can record.
- Map true adapter faults separately: missing core, spawn failure, timeout,
  output cap exceeded, non-JSON output when an envelope is required, non-zero
  crash without a status envelope, invalid capability, invalid input, and unsafe
  diagnostics. Errors exposed above the adapter must be tiered and redacted:
  no raw argv, cwd, environment, full stderr, or local filesystem internals in
  collaborator-facing responses.
- Return enough structured data for later receipts: capability id, mode,
  operation child key when present, sanitized diagnostics, core status, core
  envelope when safe, checks/conflict/refusal summaries, stdout-cap metadata,
  timeout/cap values, and any post-write path or blob hash observations
  available at this layer. Do not implement the apply job state machine here.
- Enforce the amended V1 single-child materialization boundary at the adapter
  entry point or immediately before it. Older broad DTO examples must not be
  read as permission to run partial multi-child materialization.

`S173` test checklist:

- Prove the capability registry permits only semantic walking-skeleton
  capabilities and rejects direct core verb exposure.
- Prove argument builders reject flag-shaped, absolute, traversal, malformed
  hash, malformed token, and unsupported-operation inputs before any subprocess
  run.
- Prove body edit, frontmatter edit, and create map to the expected fixed argv
  templates and stdin behavior without exposing caller-provided verbs.
- Exercise real bounded subprocess behavior for success, business refusal,
  missing core, timeout kill, output cap, non-JSON output, and redacted
  diagnostics. Tests must use real code paths and real process execution, not
  mocks, stubs, monkeypatches, `skip`, or `xfail`.
- Prove multi-child or staged materialization requests fail as typed unsupported
  capability results and do not mutate documents.
- Include validation and materialization-mode coverage, but leave approval
  freshness, apply idempotency, receipts, watcher convergence, and rollback to
  their later plan phases.

`S175` verification checklist:

- Confirm authoring route fixtures and API DTOs contain no `/ops/core`,
  `vaultspec-core`, raw verb, or arbitrary argv contract.
- Confirm collaborators cannot request core-shaped writes through authoring
  commands; any attempt must fail as an unsupported semantic capability or input
  validation error before spawn.
- Confirm existing `/ops/core/*` routes remain legacy/ops surfaces and are not
  referenced as the authoring apply path in frontend or agent-facing fixtures.
- Interpret collaborator non-exposure as an authoring API and tool contract:
  legacy `/ops/core/*` routes may still exist until their retirement phase, but
  `W03.P35` must not make them the authoring contract.
- Manually inventory registered routes after `S172` and tests: no new
  `/authoring/*/core`, `/authoring/*/vaultspec-core`, or verb passthrough route
  may appear.

Scope exclusions for `W03.P35`:

- Do not implement approval request or decision persistence.
- Do not implement apply jobs, idempotent apply receipts, watcher convergence,
  rollback proposals, or after-the-fact review lanes.
- Do not implement multi-child staged apply, compensation, or batch
  transactions. V1 apply remains single-child until core provides a true batch
  transaction capability.
- Treat any plan wording that still mentions staged multi-document apply or
  compensation in this phase as superseded by the amended apply materialization
  ADR and rollout reference.
- Do not implement section-scoped edits, chunk APIs, advisory leases, rebase,
  LangGraph runtime wiring, permission interrupts, or frontend review surfaces.
- Do not duplicate `.vault/` mutation semantics in Rust and do not hand-write
  vault documents.

## Notes

No code was changed for this grounding step. The main trap is that
`routes::ops` already contains core-shaped write endpoints that are safe enough
for the legacy editor, but the accepted ADRs explicitly reject those endpoints
as the authoring collaborator contract. The next implementation should reuse the
bounded-runner discipline, not the public route shape. A second trap is that the
reference names body, frontmatter, and create capabilities while the current
walking skeleton only materializes whole-document `replace_body`; the registry
may expose private builders for the named capabilities, but downstream public
proposal semantics must not be widened in this phase.
