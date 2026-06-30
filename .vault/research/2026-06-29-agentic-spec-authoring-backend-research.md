---
tags:
  - '#research'
  - '#agentic-spec-authoring-backend'
date: '2026-06-29'
modified: '2026-06-29'
related: []
---

# `agentic-spec-authoring-backend` research: `approval-driven collaborative document authoring backend`

This research reframes the feature from "build collaborative editing" into a
more precise backend problem: build a server-authoritative document change
control plane for Vaultspec markdown documents. Human users and LangGraph-style
agents need to draft proposed changes, stream progress, review diffs, approve or
reject proposals, apply approved changes through the Rust Vaultspec backend, and
roll back applied changes through auditable new history states. `vaultspec-core`
can remain an internal materialization and validation adapter, but it must not be
the collaborator-facing editor API.

The important scope boundary is that the first backend does not need to be a
Google Docs clone. Live text collaboration technology such as CRDT or OT is a
separate editor-room substrate. The immediate product requirement is reviewable,
approval-driven spec authoring with durable proposal state and safe application
to `.vault/` documents.

## Findings

### F1 - The useful question is a change-control-plane question

The original brief mixed four problems that should be separated:

- live text co-editing: simultaneous cursor-by-cursor edits, presence, and merge
  semantics;
- proposal review: proposed document states, diffs, comments, approval, rejection,
  and stale-review rules;
- agent execution: LangGraph runs, checkpoints, interrupts, tool calls, retries,
  token streams, and human gates;
- document history: authoritative revisions, rollback, validation, audit, and
  filesystem materialization.

The better research prompt is:

"Design a server-authoritative document change control plane for Vaultspec
markdown documents. Humans and LangGraph agents must be able to draft proposed
changes, stream progress, review diffs, approve or reject changes, apply approved
changes with concurrency checks through the Rust Vaultspec backend, and roll back
through auditable revisions. The backend may call `vaultspec-core` internally, but
all collaborators integrate with the Vaultspec backend contract. Enumerate the
architecture decisions required before implementation."

This framing keeps the backend aligned with the user requirement without forcing
CRDT/OT complexity into V1.

### F2 - The current backend already supports simple safe writes, but not authoring workflow

The current system has a strong base:

- `routes/content.rs` serves bounded document content with a `blob_hash`;
- `routes/ops.rs` brokers `set-body`, `set-frontmatter`, `edit`, `rename`,
  `create`, `archive`, `unarchive`, and `link` through whitelisted
  `vaultspec-core` verbs;
- the write broker validates fields, carries caps and timeouts, streams body
  text through stdin, forwards core envelopes verbatim, and keeps the engine
  read-and-infer;
- frontend mutations in `queries.ts` route body/frontmatter/create/rename
  requests through `dispatchOps`;
- the editor state in `viewStore.ts` is intentionally a single local draft with
  a single `baseBlobHash` and a finite status enum;
- `stream.rs` and the frontend stream reducers already provide bounded SSE
  recovery for graph, git, backend, and index signals.

This evidence supports the corrected hypothesis: the collaborator-facing surface
should be the Rust backend. The current `/ops/core/*` routes prove that the
backend can call core as an implementation detail, but those routes are too
low-level and core-shaped to be the future agentic authoring contract. The
authoring API should expose Vaultspec concepts such as proposals, changesets,
reviews, approvals, conflicts, leases, and rollback requests. It should translate
those concepts into core calls only at the internal materialization boundary.

The missing backend is not "save a file." It is:

- proposal identity;
- durable proposal and review state;
- apply/reject/rollback transitions;
- multi-actor authoring sessions;
- agent run linkage;
- lifecycle streams for proposals and approvals;
- user/agent actor provenance;
- concurrency policy beyond one optimistic save;
- rollback preimages or inverse changes;
- backend-served projections for review queues and action eligibility.

### F3 - LangGraph state is execution state, not product history

LangGraph provides durable execution primitives: checkpoints, thread ids,
interrupts, event streaming, replay, and resume. Those are valuable for agent
workflows, but they are not the authoritative history of a Vaultspec document.

The product history must live behind the Rust Vaultspec backend in a Vaultspec
authoring store with stable records independent of LangGraph and `vaultspec-core`
implementation details. A proposal can reference `thread_id`, `run_id`,
`checkpoint_id`, and interrupt ids, but the proposal lifecycle, diff, approval,
rejection, rollback, and apply result must be Vaultspec backend state.

### F4 - Agent edits should become changesets, not direct document writes

Agents should not call document write verbs directly as their normal operating
mode. They should produce changesets. A changeset gives the UI and backend a
stable object to display, approve, reject, rebase, apply, and roll back.

A changeset should carry at least:

- stable `changeset_id`;
- actor and initiator provenance;
- target scope and target documents;
- base revision or base blob hash per target;
- operation kind per target: create, replace-body, edit-frontmatter, rename,
  archive, unarchive, link, delete if later supported;
- materialized preview text or target metadata;
- preimage or source snapshot for rollback;
- normalized diff for review;
- validation results from the core checkers;
- lifecycle status;
- idempotency key for apply and rollback;
- optional LangGraph thread/run/checkpoint references.

This matches how established systems handle reviewable work: the human approves a
candidate change, not the raw model token stream.

### F5 - V1 should be revisioned and server-authoritative, not CRDT-first

CRDTs and OT solve real-time collaborative typing. They are appropriate when two
people must edit the same buffer at the same time and see character-level
convergence. They are not the simplest authority for approval-driven markdown
spec changes.

The better V1 is:

- canonical document state remains a vault document exposed through the Rust
  Vaultspec backend contract and materialized through an internal writer adapter;
- proposed work lives in an authoring store as revisioned changesets;
- application checks each target's expected base hash or revision;
- stale proposals become conflicted or require rebase before approval/apply;
- optional short advisory leases reduce collisions but never replace base checks.

CRDT/OT can be added later as an active editing-room implementation that emits a
materialized changeset when the room is submitted for review.

### F6 - There are four buffers, each with a different owner

The confusing part of "buffer management" becomes manageable if the backend names
the buffers explicitly:

- canonical buffer: current `.vault/` document content, owned by
  the Rust Vaultspec backend contract and written through an internal adapter;
- local editor buffer: unsaved UI draft, currently frontend-owned and bounded;
- agent run buffer: transient generated text/tool state, owned by LangGraph
  checkpoints and event streams;
- proposal buffer: durable materialized candidate document state, owned by the
  Vaultspec authoring backend.

Only the canonical buffer is applied to the vault. Only the proposal buffer is
reviewed. Agent run buffers are evidence and diagnostics, not document truth.
Local editor buffers are user convenience, not shared authoring history.

### F7 - Approval, rejection, and rollback need a formal lifecycle

Ad hoc booleans will fail under concurrent agents. The backend needs an explicit
state machine. The final status vocabulary is owned by the changeset-ledger ADR;
this research now uses the same snake_case shape:

- `draft`: a human or agent is building the proposal;
- `generating`: an agent run is actively streaming work;
- `proposed`: a reviewable candidate exists;
- `needs_review`: policy requires human approval before apply;
- `approved`: a reviewer approved the candidate but it has not applied yet;
- `applying`: an idempotent apply command is in flight;
- `applied`: core accepted and wrote the change;
- `partially_applied`: some child operations materialized and others did not;
- `compensation_required`: staged materialization requires explicit follow-up;
- `rejected`: reviewer declined an unapplied proposal;
- `conflicted`: base changed or validation no longer passes;
- `superseded`: another proposal replaced this one;
- `failed`: execution or validation failed in a non-conflict way;
- `rollback_proposed`: a rollback candidate exists.

`rolled_back` is not a canonical stored status in the final ADR set. It is a
derived projection on a source changeset after a rollback changeset applies. The
requirement is that the backend serves state and action eligibility. The frontend
should not infer whether a proposal can be approved, applied, or rolled back.

### F8 - Rollback should append history, not erase it

Rejected proposals do not need rollback because they never touched the canonical
document. Applied changes do.

Rollback should be modeled as a new changeset that restores a prior preimage or
applies an inverse operation. It should not delete proposal history, delete
LangGraph checkpoints, or mutate old events. If a vault document change has
already been committed to git, git-level revert is a related but separate
decision; the authoring ledger still needs to record the rollback intent and
result.

### F9 - Streaming must separate durable lifecycle events from token noise

The existing graph/backend SSE stream is a recovery signal for graph, git,
backend, and index changes. Agent authoring needs a separate stream class:

- durable authoring events: proposal_created, generation_started,
  preview_updated, validation_updated, review_requested, approval_resolved,
  apply_started, apply_recorded, conflict_recorded, proposal_rejected,
  rollback_proposal_created, cancellation_recorded, failure_recorded;
- ephemeral generation events: token chunks, intermediate model messages, tool
  traces, live status, cursor/presence if an editor room is later added.

Durable events need resumability or snapshot recovery. Token streams can be
bounded, dropped, or summarized. Mixing them on one ring risks losing important
approval state during high-volume generation.

### F10 - Pending approvals are product state, not cache or best-effort session state

`engine-store` is re-derivable engine data. `vaultspec-session` is user/session
state and has best-effort healing behavior. Neither is the obvious home for
pending approvals and rollback preimages.

The authoring backend needs a dedicated durable store, or a new core-owned store,
with:

- fail-loud schema/version handling;
- migrations;
- concurrency discipline;
- retention and compaction rules;
- export/backup expectations;
- bounded query surfaces;
- explicit relationship to `.vault/` and git history.

Losing a pending proposal should be treated as product data loss, not cache
rebuild.

### F11 - Locks are a UX coordination tool, not the correctness mechanism

Existing `blob_hash` optimistic concurrency is the correctness floor. Locks and
leases can reduce collisions, but they should be advisory, TTL-bound, and backed
by fencing tokens. A crashed agent must not strand a document indefinitely. An
approval must still verify that the base revision is valid before applying.

This leads to a likely V1 policy:

- ordinary proposals can be concurrent;
- applying uses compare-and-swap on base revision or blob hash;
- whole-document rewrites or destructive operations may request a short lease;
- stale or missing lease does not permit bypassing revision checks;
- conflicts are first-class proposal states, not generic failures.

### F12 - Multi-document changes require a transaction decision

Agentic spec authoring will not be only single body edits. Real workflows include
create plus link, rename plus incoming link rewrite, archive plus cross-feature
link repair, bulk rewrite, and generated plan/ADR pairs.

The backend must decide whether a changeset is:

- single-document only in V1;
- multi-document but applied document-by-document with partial failure states;
- multi-document atomic at the authoring ledger but eventually materialized by
  core;
- core-owned atomic transaction across the affected vault files.

This is one of the largest architecture decisions because rollback, review diffs,
validation, and conflict detection all depend on it.

### F13 - Security and provenance must assume agents are untrusted writers

Agentic editing makes prompt injection and confused-deputy problems practical.
The backend should not treat "an agent asked to write" as authority to mutate the
vault.

Required decisions include:

- actor model: human, agent, system, tool;
- permission model: who can propose, approve, apply, roll back, archive, rename;
- tool allowlist: which core verbs an agent can request;
- approval gates for side effects;
- provenance fields for prompt, tool, model, run id, source context, and reviewer;
- audit visibility and retention;
- whether self-approval by the proposing agent is forbidden.

### F14 - Backend projections must be served, not inferred in the UI

Existing rules require displayed and filterable state to be backend-served. That
means the authoring API should serve:

- proposal list by scope/document/status/actor;
- counts by status;
- per-document current locks/leases;
- active agent runs;
- review queue state;
- action eligibility: approve, reject, apply, rebase, roll back, discard;
- conflict reason;
- validation status;
- stale approval status.

The UI can format labels, but it should not derive policy from raw events.

### F15 - Hypothesis verdict: viable, with one architectural caveat

The user's corrected hypothesis is viable and is the stronger architecture:

- the shared surface should be the Rust Vaultspec backend;
- the target editor should be a backend-owned abstraction over proposals,
  changesets, approvals, conflicts, leases, rollback, and streams;
- `vaultspec-core` should remain hidden from collaborators as an internal adapter
  for validation and `.vault/` materialization;
- agents should integrate with the backend authoring contract, not with core or
  core-shaped frontend routes.

The local code supports this direction. The current Rust backend already acts as
the browser/server boundary, owns route envelopes and tiers, gates route
inventory, validates write inputs, wraps sibling calls, and keeps frontend access
inside `frontend/src/stores/`. That is exactly the shape of a backend facade or
anti-corruption layer: collaborators see the product contract, while lower-level
subsystems remain internal.

The caveat is the existing `engine-read-and-infer` rule. A proposal ledger,
approval workflow, and rollback state are write-side product state. They should
not be described as "just more transparent `/ops/core/*` passthrough." The ADR
must either define a new Rust authoring backend domain beside the read-and-infer
engine, or explicitly refine the rule so the Rust backend can own authoring
workflow state while still never hand-writing `.vault/` documents or leaking core
semantics to collaborators.

## How established systems map to this problem

| Pattern | What it solves | Why it is not enough alone | Use in Vaultspec |
|---|---|---|---|
| Optimistic concurrency with ETags or revisions | Prevents lost updates | Detects conflicts but does not model review or rollback | Keep as the apply correctness floor |
| Server-side serialized patch queue | Gives one canonical order | Needs proposal/review state and conflict handling | Good fit for apply commands |
| Branch/proposal model | Separates candidate changes from main | Needs merge/rebase and stale-approval policy | Core model for agents |
| Event sourcing | Durable audit and rebuildable projections | Adds schema evolution and snapshot concerns | Use for authoring lifecycle events if store is dedicated |
| Transactional outbox | Reliable stream/materialization after commit | Does not define document semantics | Use for authoring event publication |
| Advisory leases | Reduces editing collisions | Stale locks and false safety if used alone | Use with TTL/fencing, never instead of revisions |
| JSON Patch | Structured object edits with preconditions | Poor fit for raw markdown unless using an AST | Useful for metadata or AST operations |
| Unified diff | Human review of text changes | Patch application can be fuzzy or ambiguous | Store for review, not as sole authority |
| Full snapshot/preimage | Simple rollback and preview | Larger storage and coarser merge | Good V1 for markdown proposals |
| CRDT/OT | Live concurrent text editing | Complex authority, compaction, and review semantics | Defer unless live co-editing is required |

## Architecture decision inventory

### D1 - Product boundary

Question: Is this an editor engine, a proposal/review backend, or both?

Why: If the team chooses "collaborative editor" as the primary problem, CRDT/OT
and cursor-level merge semantics dominate. If the team chooses "approval-driven
authoring," the dominant objects are changesets, approvals, revisions, and
backend-owned apply commands.

Likely answer: V1 is a proposal/review backend. Live editing room technology is a
future optional substrate.

### D2 - Authority and ownership

Question: Who owns the collaborator-facing document editor contract?

Why: Collaborators need one stable Vaultspec backend API. Exposing
`vaultspec-core` directly would leak an implementation detail, couple agents to
CLI/wheel semantics, and bypass the dashboard backend's tiers, policy, streaming,
and state projections. At the same time, the existing read-and-infer rule means
the Rust backend should not hand-roll `.vault/` file mutation semantics that core
already owns.

Options:

- Rust backend owns the editor/proposal API and uses core as an internal
  materialization adapter;
- Rust backend owns the authoring ledger but exposes core-shaped `/ops/core/*`
  endpoints to collaborators;
- core owns both the ledger and document writes;
- a Python agent sidecar owns proposal state and calls the engine/core.

Likely answer: the Rust Vaultspec backend owns the public editor/proposal
contract, proposal state, approval policy, concurrency checks, and projections.
`vaultspec-core` remains hidden behind an internal port for validation and vault
file materialization. Agents and frontend surfaces integrate with the Vaultspec
backend, never with core directly.

### D3 - Authoring store

Question: Where do proposals, approvals, preimages, and rollback records live?

Why: Pending approvals are product state. They cannot be best-effort session
state or re-derivable cache.

Options:

- new engine-side `authoring-state.sqlite3`;
- new Rust-backend-managed authoring store with an internal core adapter;
- `.vault/authoring/` documents;
- external database if multi-user server deployment is planned.

Decision pressure: single-user local dashboard may favor SQLite, while a
multi-user remote deployment may need Postgres or another server database later.
The final ADR defers the physical database binding; either way, schema must fail
loud, not heal by discarding proposal state.

### D4 - Changeset identity and grain

Question: What is the smallest reviewable unit?

Options:

- one proposal per single document;
- one proposal per operation;
- multi-document changeset with child operations;
- branch-like proposal containing many drafts.

Likely answer: use multi-document changesets even if V1 only permits one child
operation. That avoids redesign when agents produce ADR plus plan plus links.

### D5 - Change representation

Question: What does the backend store as the authoritative proposed change?

Options:

- full target snapshot plus preimage;
- unified diff;
- JSON Patch over parsed markdown AST;
- semantic operation list;
- CRDT updates;
- hybrid record.

Likely answer: hybrid V1: base metadata, preimage, materialized target snapshot,
review diff, validation result, optional semantic intent. Do not rely on a fuzzy
diff as the only source for apply or rollback.

### D6 - Document revision token

Question: What token proves the proposal is still based on the document the actor
saw?

Options:

- existing git-style `blob_hash`;
- monotonic document revision in authoring store;
- git commit and path;
- composite of scope, path, blob hash, and graph generation.

Likely answer: keep `blob_hash` for current core interoperability; consider an
authoring revision if proposal state can change without immediately touching the
file.

### D7 - Concurrency policy

Question: What happens when two users or agents edit the same document?

Options:

- hard lock blocks all other writers;
- optimistic only;
- advisory lease plus optimistic apply;
- CRDT/OT active room;
- branch/rebase workflow.

Likely answer: concurrent proposals are allowed; apply is serialized by
base-revision checks; advisory leases reduce high-risk collisions; conflicted
proposals are rebase/review problems, not transport errors.

### D8 - Lease model

Question: If locks exist, what exactly do they protect?

Why: A lock may mean "someone is typing," "an agent is rewriting," "approval is
in progress," or "apply is committing." These are different.

Decisions:

- lease scope: document, changeset, feature, or workspace;
- lease duration and renewal;
- fencing token semantics;
- break/steal policy;
- whether presence is durable or ephemeral;
- whether agents can hold exclusive leases.

Likely answer: only disruptive operations get TTL leases; ordinary proposals rely
on optimistic concurrency.

### D9 - Proposal lifecycle state machine

Question: What states exist, and which transitions are legal?

Why: Approval/rejection/rollback must survive refreshes and be safe under retries.

Decisions:

- canonical statuses;
- terminal states;
- retryable states;
- stale approval policy;
- supersession rules;
- whether `approved` and `applied` are separate.

Likely answer: keep `approved` separate from `applied`; applying is an idempotent
command that records its own result.

### D10 - Approval gates

Question: What is a human approving?

Options:

- each tool call before it happens;
- final changeset only;
- both tool call and final changeset;
- per-document operation;
- whole changeset.

Likely answer: agents may be interrupted for dangerous tool calls, but product
approval is final changeset approval. Applying a changeset is the side effect
that requires policy.

### D11 - Rejection semantics

Question: What does rejection do?

Options:

- marks proposal rejected;
- records reason and reviewer;
- cancels agent run;
- deletes draft material;
- supersedes by a requested rewrite.

Likely answer: rejection is append-only ledger state; it may cancel or stop an
associated run, but it never erases evidence.

### D12 - Apply semantics

Question: How does approval become a vault write?

Required decisions:

- idempotency key;
- expected base hash per target;
- validation before write;
- call shape into the backend-owned materialization adapter;
- how to handle internal core adapter failures and `status:"failed"` envelopes;
- whether apply is synchronous or queued;
- transaction boundary for multi-doc changesets;
- post-apply event publication.

Likely answer: apply is queued or command-like, idempotent, validates, invokes a
backend-owned materialization adapter, records the adapter result, and publishes
authoring events through an outbox. The adapter may call current core verbs, but
that detail stays below the authoring API.

### D13 - Rollback semantics

Question: How are applied changes reversed?

Options:

- restore preimage with new changeset;
- inverse operation;
- git revert;
- archive/unarchive-specific reverse verbs;
- manual repair proposal.

Likely answer: authoring rollback creates a new changeset from recorded preimage
or inverse operation and applies through the same backend materialization path.
Git revert is a separate integration decision.

### D14 - Rebase and conflict handling

Question: What happens when the base document changes before apply?

Options:

- reject apply and require regeneration;
- automatic three-way merge;
- LLM-assisted rebase proposal;
- CRDT merge if room-backed;
- reviewer chooses from conflict UI.

Likely answer: V1 marks conflicted and requires explicit rebase/regenerate. Do
not auto-merge agent rewrites into authoritative specs without review.

### D15 - Streaming architecture

Question: What streams exist?

Options:

- reuse `/stream`;
- add `/authoring/stream`;
- use WebSocket for bidirectional editing rooms;
- persist lifecycle events and expose polling only.

Likely answer: add an authoring event stream or query surface for durable
lifecycle events; keep token streams bounded and separate from graph delta
recovery.

### D16 - LangGraph integration

Question: How do LangGraph runs map to product objects?

Decisions:

- thread scope: document, changeset, session, or agent task;
- run identity;
- checkpoint persistence backend;
- interrupt payload shape;
- tool call approval policy;
- retry/idempotency behavior;
- what state is copied into Vaultspec proposal records.

Likely answer: thread per changeset or agent task, not per canonical document.
Store references to LangGraph execution state, but copy final proposal material
into Vaultspec-owned records.

### D17 - Actor and permission model

Question: Who can propose, approve, apply, and roll back?

Decisions:

- actor types;
- authentication identity;
- agent service identity;
- delegated permissions;
- whether an agent can approve its own work;
- scope/worktree permissions;
- audit fields.

Likely answer: agents propose; humans approve/apply unless a policy explicitly
allows trusted automation.

### D18 - Validation and conformance

Question: When are core checks run?

Options:

- while streaming;
- on proposal finalization;
- before approval;
- immediately before apply;
- after apply as verification.

Likely answer: run lightweight checks for previews, full conformance before
proposal can be approved, and final validation immediately before apply because
base content may have changed.

### D19 - Materialization and failure recovery

Question: What if the ledger says applied but the file write fails, or the file
changes without the ledger?

Decisions:

- transaction order between authoring store and document materialization;
- outbox and retry behavior;
- reconciliation scanner;
- orphan proposal handling;
- how watcher re-ingest confirms apply.

Likely answer: record an apply attempt, call the internal materialization adapter
idempotently, record the exact adapter result, publish event after durable state
update, and reconcile from file state plus proposal records.

### D20 - Retention, compaction, and privacy

Question: How long are proposals, prompts, model traces, diffs, and preimages
kept?

Why: Agent runs can include large prompts, copied source context, and generated
text. CRDT updates and token streams can grow without bound.

Decisions:

- retention by status;
- redaction of prompts/tool outputs;
- compression of snapshots;
- diff size caps;
- event compaction;
- export format;
- deletion policy.

### D21 - API surfaces

Question: What backend endpoints exist?

Likely endpoint families:

- create/list/read proposal;
- update draft proposal;
- submit proposal for review;
- approve/reject;
- apply;
- rollback;
- rebase/regenerate;
- list authoring events;
- acquire/renew/release lease;
- list active runs and stream run events;
- read backend-served review projections.

The routes must keep the same response discipline as the rest of the engine:
shared envelope, tiers on success and error, bounded reads, and typed business
outcomes instead of hidden transport semantics.

### D22 - Frontend state ownership

Question: Which state is local and which is backend-served?

Likely split:

- local: textarea draft, cursor, focus, temporary token display;
- backend: proposals, approvals, active runs, locks, conflicts, validation,
  rollback status, review queues, counts, action eligibility.

This follows the existing stores-owned wire-client rule and prevents the UI from
inventing workflow state.

### D23 - Testing and verification

Question: What evidence proves the backend is safe?

Required tests should be real-behavior tests, not tautological fixtures:

- two actors propose against one base;
- stale proposal cannot apply silently;
- approval becomes stale after base change;
- reject does not mutate canonical document;
- apply is idempotent under retry;
- rollback creates a new auditable change;
- validation refusal preserves draft/proposal;
- lifecycle stream recovers from missed token events;
- lease expiry allows progress while fencing stale applies;
- multi-doc changeset failure is represented honestly.

## Recommended V1 shape

The strongest V1 architecture is:

1. Make the Rust Vaultspec backend the only collaborator-facing editor and
   authoring API.
2. Keep `vaultspec-core` hidden behind an internal materialization and validation
   adapter; it may write `.vault/` files, but agents and frontend surfaces never
   integrate with it directly.
3. Add a durable authoring store for changesets, review state, preimages,
   validation results, actor provenance, and run references.
4. Treat every human or agent edit as a proposal changeset until approved.
5. Store materialized target snapshots and preimages for markdown bodies, plus
   review diffs and optional semantic intent.
6. Apply approved changes through backend-owned apply commands with expected base
   hashes; those commands may use current core write/create/rename/link/archive
   verbs internally.
7. Make rejection ledger-only and rollback append-only.
8. Add authoring lifecycle events separate from high-volume token streams.
9. Use advisory TTL leases only for coordination; correctness remains optimistic
   base checks.
10. Keep LangGraph checkpoints as execution state and copy final review material
   into Vaultspec-owned proposal records.
11. Defer CRDT/OT unless the product explicitly requires live simultaneous typing
    inside the same document buffer.

## ADR candidates

The proposed ADR corpus persisted from this research is:

1. `agentic-authoring-boundary-adr`: define the fenced Rust authoring API,
   internal core adapter, authoring domain ownership, and the read/infer engine
   caveat.
2. `agentic-authoring-api-contract-adr`: define V1 semantic endpoint families,
   idempotency placement, recovery surfaces, and agent tool aliases.
3. `agentic-authoring-state-store-adr`: define durable authoring-state
   invariants, migrations, backup, retention, and separation from LangGraph
   checkpoints.
4. `agentic-changeset-ledger-adr`: define proposal identity, canonical lifecycle,
   child operations, idempotency, and backend projections.
5. `agentic-document-identity-adr`: define existing and provisional document
   target references across create, rename, archive, apply, and rollback.
6. `agentic-change-format-and-chunking-adr`: define proposal snapshots, semantic
   operations, diffs as review artifacts, rollback material, and section-edit
   evidence.
7. `agentic-document-chunk-management-adr`: define revision-scoped document
   chunk identity, bounded chunk APIs, invalidation, and retention.
8. `agentic-concurrency-leases-conflicts-adr`: define base revision policy,
   advisory leases, fencing, conflict, and rebase behavior.
9. `agentic-multiagent-composition-adr`: define parallel agent work units,
   target-scope composition, competing candidates, and fresh approval rules.
10. `agentic-approval-gates-review-state-adr`: define approval policy, stale
    approvals, tool permissions versus changeset approvals, and review actions.
11. `agentic-review-station-state-adr`: define review queue item states,
    assignment/claiming, clarification loops, and station projections.
12. `agentic-langgraph-integration-adr`: map threads, runs, checkpoints,
    interrupts, and tool calls to Vaultspec proposal records.
13. `agentic-streaming-events-outbox-adr`: separate durable authoring events from
    token streams and define recovery/outbox invariants.
14. `agentic-apply-materialization-adr`: define apply command semantics,
    internal core adapter usage, idempotency, validation, staged multi-doc
    materialization, and receipts.
15. `agentic-rollback-history-adr`: define rollback as a new changeset, the
    operation rollback matrix, preimage retention, and git-revert relationship.
16. `agentic-security-provenance-adr`: define actor model, permissions, agent
    tool gates, audit, provenance, and self-approval rules.
17. `agentic-live-editing-room-adr`: defer CRDT/OT live rooms while preserving
    the rule that any future room submits reviewable changesets.

## Primary source notes

Local grounding:

- `routes/content.rs` serves bounded content and `blob_hash`.
- `routes/ops.rs` owns the whitelisted core broker for current write/create/
  rename/archive/link actions. This is evidence that the Rust backend can call
  core internally; it is not evidence that future collaborators should call
  core-shaped routes directly.
- `stream.rs` owns the existing bounded SSE recovery stream.
- `viewStore.ts` holds a single local editor draft and optimistic base hash.
- `queries.ts` and `opsActions.ts` are the frontend write seams.
- Existing research and ADR documents for `document-editor-backend` and
  `document-edit-hardening` establish the current write boundary and hardening
  gaps.
- `dashboard-layer-ownership` requires frontend app and scene code to consume
  backend state through stores, not direct engine/core calls.
- `engine-read-and-infer` is the main caveat: an authoring backend ADR must
  either place workflow state in a sibling Rust service/module or refine the rule
  so the Rust backend can own proposal state while still never hand-writing
  `.vault/` files.

External primary sources:

- LangGraph persistence, checkpoints, thread ids, interrupts, and streaming:
  https://docs.langchain.com/oss/python/langgraph/persistence
  https://docs.langchain.com/oss/python/langgraph/interrupts
  https://docs.langchain.com/oss/python/langgraph/functional-api
- LangChain human-in-the-loop middleware:
  https://docs.langchain.com/oss/python/langchain/human-in-the-loop
- Yjs document updates and awareness:
  https://github.com/yjs/docs/blob/main/api/document-updates.md
  https://github.com/yjs/docs/blob/main/api/about-awareness/README.md
- ProseMirror collaborative editing guide:
  https://prosemirror.net/docs/guide/#collab
- Automerge concepts:
  https://automerge.org/docs/reference/concepts/
- HTTP conditional request and lost-update basis:
  https://datatracker.ietf.org/doc/html/rfc9110
- JSON Patch and Merge Patch:
  https://datatracker.ietf.org/doc/html/rfc6902
  https://datatracker.ietf.org/doc/html/rfc7396
- SQLite WAL:
  https://www.sqlite.org/wal.html
- Git revert:
  https://git-scm.com/docs/git-revert
- Backend-for-frontend, anti-corruption layer, and ports/adapters patterns:
  https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends
  https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer
  https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html
