---
tags:
  - '#audit'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-08'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
  - "[[2026-06-30-agentic-spec-authoring-backend-audit]]"
  - "[[2026-06-29-agentic-authoring-boundary-adr]]"
  - "[[2026-06-29-agentic-changeset-ledger-adr]]"
  - "[[2026-06-29-agentic-approval-gates-review-state-adr]]"
---

# `agentic-spec-authoring-backend` audit: `architecture review toward hardened superseding ADRs`

## Scope

User-briefed architecture review (2026-07-02) of the in-flight agent-driven editor
backend: the `agentic-spec-authoring-backend` feature — a server-authoritative
document change-control plane with versioning, fallback (rollback), and user-approval
state management, in preparation for multi-concurrent editor interfaces. The brief:
locate the binding ADRs and research, review the decisions AND the current
implementation, test the suspicion that this is provisional pre-alpha architecture,
and produce the ground for HARDENED, SUPERSEDING ADRs — clarifying open decisions,
simplifying, and making the system robust enough to deliver the target flow: agentic
editors propose changes; the user accepts or denies them; or, based on operation
mode, changes apply autonomously.

Corpus reviewed: the 17-ADR cluster (all `2026-06-29-agentic-*`, every one status
`accepted`), the framing research (23-decision inventory), the L4 plan (9 waves, 43
phases, 215 steps), the rolling per-phase review audit, and the implementation at
`engine/crates/vaultspec-api/src/authoring/` (`mod.rs`, `model.rs`, `response.rs`,
`api.rs`, `documents.rs`, `routes.rs`, `store/` — migrations, unit-of-work,
idempotency, retention, outbox). Distinct finding-ID namespace `ASA-###` (this audit
is the architecture review; the sibling same-feature audit dated 2026-06-30 is the
rolling per-phase implementation review). Audit-only; no product code changed.

## Findings

### ASA-001 | info | Corpus and implementation reality: high-quality bottom-up infrastructure, one live route, all decisions accepted as a block

The binding decision corpus is 17 ADRs authored and ACCEPTED together on one day
(2026-06-29), elaborating a strong framing research document. The plan is L4: 9
waves / 43 phases / 215 steps. Implemented and phase-reviewed so far (W01+W02, 45
steps): the fenced `authoring` module and route shell, the shared response grammar,
the typed model/command vocabulary, versioned V1 DTO fixtures for all 8 endpoint
families, and the durable-store primitives — fail-loud migrations, unit-of-work,
scoped idempotency records, retention/compaction/backup classes, and a transactional
outbox. W03.P10 (document reference resolver) is in flight. The ONLY live route
today is `/authoring/status`, returning a disabled-state snapshot
(`authoring/routes.rs:13-15`); roughly 190KB of Rust exists with zero functional
authoring endpoint. Verdict on the "provisional pre-alpha" suspicion: HALF right.
The code is NOT provisional — the per-phase review discipline is real and caught
real defects (a HIGH product-state-in-cache-directory placement, a HIGH idempotency
expiry-ordering bug, a HIGH rollback-limitation overwrite). What IS provisional is
the architecture's relationship to evidence: the cluster commits V1 to ~35–40
distinct backend concepts (1 store, ~12 aggregate/record families, 4 state machines
— a 16-status changeset lifecycle, an 11-state review-queue, a 6-value composition
projection, chunk staleness — 8 route families, 2 stream classes) with no working
vertical behind any of them, and the block acceptance of 17 ADRs in one day means no
decision received individual adversarial scrutiny.

### ASA-002 | high | Value inversion: the first end-to-end propose→approve→apply flow arrives in wave 8 of 9 — ~170 steps of infrastructure precede the first vertical proof

The plan is strictly bottom-up: contract (W01) → store (W02) → identity/chunks
(W03) → ledger (W04) → policy/review (W05) → collaboration/composition (W06) →
LangGraph/streams (W07) → apply/rollback (W08) → integration (W09). The product's
defining loop — an agent proposes a change, a user approves or denies it, an
approved change materializes — cannot be demonstrated until W08.P36 lands and is not
proven until W09. Failure scenario: the first real usage lesson (an agent's actual
proposal shape, a user's actual review behaviour, a real conflict) arrives after
~170 more steps of committed infrastructure, and anything it invalidates — a status
that turns out unreachable, a projection nobody reads, a chunk contract agents don't
use — is already load-bearing schema. The per-phase review quality (ASA-001) cannot
compensate: it verifies each brick, not whether the wall is in the right place.
This is the single highest-leverage supersession: re-sequence the PLAN around one
thin walking skeleton — single-document changeset: propose → validate → submit →
approve/reject → apply (through the existing, live-verified `/ops/core` edit verbs
as the materialization adapter's first capability) → preimage rollback — reusing the
already-built W02 store primitives, and grow the remaining waves as increments
BEHIND a working flow rather than in front of it.

### ASA-003 | high | Speculative scope committed as accepted V1: four subsystems decide far ahead of need and should be demoted to deferred

Cross-reading the cluster against the target flow, four accepted subsystems are
speculative in the precise sense that no V1 consumer exists and simpler accepted
mechanisms already cover the requirement: (1) `agentic-multiagent-composition` — the
full `agent_work_unit` model with a 6-value composition projection (disjoint/
overlapping/competing/superseding/depends_on/blocked) and composed-candidate
generation, ahead of any single-agent path; V1 needs only "concurrent proposals are
allowed; apply is serialized by base-revision checks; overlap becomes `conflicted`"
— which the concurrency ADR already decides. (2)
`agentic-document-chunk-management` — chunker-version contracts, hash-only
degradation, and index-migration semantics before any retrieval consumer; V1 agents
can read bounded context through the existing content routes, and chunk evidence on
proposals can be optional provenance. (3) The review-station's 11 queue states
(`queued/claimed/in_review/waiting_on_agent/clarification_requested/
clarification_responded/reviewer_editing/stale/escalated/decision_submitted/closed`)
— V1 review is one human accepting or denying: four states (queued, claimed,
decision_submitted, closed) plus the existing `respond` action cover it; the rest is
projection vocabulary that can grow back when a real review team exists. (4) The
rollback ADR's per-operation inverse matrix (rename-inverse + link repair,
tombstone-vs-delete policy, section-selector restore) — V1 needs whole-document
preimage restore, honestly refusing the rest with the already-decided
`rollback_unavailable_reason`. None of these decisions is WRONG; they are premature
as ACCEPTED commitments and belong in deferred/proposed status until the walking
skeleton generates evidence.

### ASA-004 | medium | Decision needed: multi-document apply drags a saga/compensation engine into V1 that single-child apply would delete

The apply ADR is honest that core has no cross-document atomic batch, and therefore
V1 invents staged materialization: per-child receipts, `partially_applied`,
`compensation_required`, compensation records, watcher-convergence checks, and
repair-state projections (plan W08.P37). That is a saga engine built to compensate
for a capability gap in a sibling — carried into V1 solely because the changeset
SCHEMA is multi-document. The schema decision is right (the DTO work is done and
cheap to keep); the EXECUTION decision should be superseded: V1 apply accepts only
single-child changesets (a multi-child changeset is refusable with an honest typed
error), which deletes the compensation subsystem, two lifecycle statuses, and the
convergence machinery from the critical path, and simplifies rollback, conflict
detection, and approval freshness in one stroke. Multi-document apply returns when
`vaultspec-core` grows a batch transaction (file the gap upstream per
`engine-read-and-infer` discipline), restoring atomicity instead of compensating for
its absence.

### ASA-005 | medium | Decision needed: OPERATION MODE (autonomous delivery) is the user's headline requirement and no ADR owns it

The brief names the target flow explicitly: propose → user accepts/denies → "or
automatically, based on operation mode (it can be delivered autonomously)". In the
accepted cluster, auto-apply exists only as a narrow exception clause stated twice:
approval-gates ("a separate system actor may auto-apply only when a recorded policy
permits a specific non-destructive class") and security-provenance ("trusted
automation can auto-apply only under an explicit recorded system policy, not by
pretending to be a reviewer"). There is no OPERATION-MODE concept: no mode
vocabulary (e.g. manual / assisted / autonomous), no decision on mode scope (per
workspace? per session? per agent? per risk class?), no lifecycle path for an
auto-approved changeset (does it pass through `needs_review`? who is the recorded
approver?), no after-the-fact review surface (an "applied autonomously" queue the
user can inspect and roll back from), no kill-switch/downgrade semantics, and no
statement of how mode interacts with the stale-approval rules. As accepted, the
autonomous flow the user requires is only reachable by stretching an exception
clause. This needs its own hardened ADR — operation mode as backend policy DATA
(consistent with the approval-policy-is-data decision), with the system-actor
approval recorded per the existing audit shape, and the review station gaining an
after-the-fact lane rather than a bypass.

### ASA-006 | medium | Decision needed: the read-and-infer rule refinement the boundary ADR requires was never landed, and implementation has begun

The boundary ADR states the `engine-read-and-infer` caveat "must be refined before
implementation" if the authoring domain co-locates with the engine. Implementation
began (W01–W02 shipped; the store writes durable product state under
`.vault/data/authoring-state`) and the rule still reads as before: the engine is
read-and-infer, its SQLite state "deletable, fully re-derivable". The authoring
store is deliberately NEITHER (the W02.P05 review correctly moved it OUT of the
re-derivable cache directory for exactly this reason) — so the codified fence and
the shipped code now disagree in letter, reconciled only by an unlanded promise. The
spirit is defensible: the authoring domain never hand-writes `.vault/` documents;
core remains the sole document writer; the new state is workflow/product state, not
vault content. But that distinction lives in comments and one ADR paragraph, not in
the rule set that binds future agents. The promised refinement should land as its
own decision: amend `engine-read-and-infer` (or codify a sibling
`authoring-domain-owns-workflow-state-never-documents` rule) BEFORE W04 makes the
ledger load-bearing.

### ASA-007 | medium | Decision needed: two write paths now exist — the user's direct editor save bypasses the ledger the agents must use

The boundary ADR explicitly does not supersede the 2026-06-16/2026-06-18 editor
ADRs, so the human editor's save path (`/ops/core/set-body` etc., optimistic
`blob_hash`, live-verified) continues BESIDE the authoring plane. For the stated
goal — multi-concurrent editor interfaces over one history — this is a fork in the
single-source-of-truth story: a user's direct save mutates a document invisibly to
the changeset ledger (no proposal, no preimage, no event), while every agent
mutation is ledgered; concurrent-editor guarantees (leases, conflicts, review
provenance, rollback) hold on one path and not the other, and any UI showing "who
changed this and why" will have holes exactly where the human typed. A decision is
needed and neither ADR set makes it: EITHER the human editor save becomes a
changeset too (an auto-approved, mode=direct changeset — one history, one rollback
story, and the operation-mode ADR of ASA-005 gives it a natural home), OR dual-path
is the accepted design and the fence must be codified (what the ledger claims to
know, what the direct path is allowed to touch, how a ledgered rollback interacts
with un-ledgered edits — today a direct save silently invalidates a stored preimage's
"current base" assumptions and only the apply-time revision check catches it).

### ASA-008 | low | Corpus hygiene: block acceptance, heavy restatement, and deferral-ADRs dilute the decision record

All 17 ADRs were accepted simultaneously; several are not decisions but deferrals or
elaborations: `agentic-live-editing-room` decides only what NOT to build;
`agentic-change-format-and-chunking` and `agentic-document-chunk-management` split
one concern across two documents with overlapping content; idempotency placement is
restated in six ADRs, the stale-approval trigger list in four, and the self-approval
ban in two. Restatement is drift surface: when the superseding pass (ASA-003/004/005)
changes one of these shared rules, six documents must move together or the corpus
contradicts itself. The consolidation shape: keep the load-bearing five as the
hardened core (boundary, ledger, approval-gates+review-station folded,
concurrency+leases, apply+rollback folded), fold the chunking pair into one deferred
ADR, mark multiagent-composition and live-editing-room as explicitly deferred, and
let ONE document (the ledger ADR, which already owns the lifecycle vocabulary) own
each shared rule with the others referencing instead of restating.

### ASA-009 | info | What is sound and must survive any supersession

The load-bearing decisions are correct and should be preserved verbatim in the
hardened set: (a) the boundary — a backend-owned SEMANTIC authoring API; agents and
frontend never see core-shaped verbs; core hidden behind a private materialization
adapter; the backend never hand-writes vault documents; (b) revision-first
optimistic concurrency as the correctness floor, with leases strictly advisory,
TTL-bound, fencing-tokened, and never a bypass of base checks; (c) `approved` ≠
`applied`, apply as an idempotent command with its own recorded receipt, and
approvals bound to a reviewed tuple (proposal revision + base revisions + validation
digest + policy version) with stale-approval invalidation; (d) append-only ledger +
transactional outbox + scoped idempotency — the W02 implementation of these is
reviewed and solid; (e) LangGraph as execution state, never product history, with
interrupts resumed by stable id; (f) changesets as the reviewable unit (never raw
token streams), diffs as derived review artifacts never apply authority; (g)
rejection as append-only evidence, rollback as a new forward changeset. The research
document itself is exemplary and its decision inventory (D1–D23) remains the right
checklist for the superseding pass.

### ASA-006-resolution | info | RESOLVED 2026-07-02/04 — the rule refinement is landed, synced, and the boundary ADR marks it discharged

The promised refinement landed the same day as this audit and was verified again on
2026-07-04 when the team re-raised the finding from a stale view. The codified fence
now lives in the consolidated architecture rule (`.vaultspec/rules/architecture-boundaries.md`,
synced to the provider dirs): the fenced authoring module may own durable WORKFLOW
state (changeset ledger, approvals, preimages, receipts, audit) in its non-derivable
store under `.vault/data/authoring-state/`, reaches vault materialization only
through its internal capped/timed/project-pinned core adapter, and never hand-writes
`.vault/` documents or mutates git — while the engine's own inference cache remains
"deletable, fully re-derivable" (the two clauses now coexist without contradiction).
The boundary ADR's Constraints section was amended to state the refinement is
DECIDED and the rule text amended to match, closing the letter-vs-code gap. Nothing
further is owed before the ledger becomes load-bearing.

### ASA-007-resolution | info | RESOLVED — decided by the accepted operation-modes ADR: the human save becomes a kind=direct changeset; dual-path is a bounded transition, not an end state

The 2026-07-02 `agentic-operation-modes` ADR (accepted) explicitly owns this finding
(named in its Problem Statement) and takes the unify option: the editor's save
creates a `kind=direct` changeset — preimage captured, child operation recorded,
auto-approved by the authoring HUMAN's own actor identity (a principled carve-out:
the self-approval ban targets agents as untrusted writers; a human editing their own
document IS the review) — applied immediately through the same idempotent apply
command. The existing `/ops/core` direct broker survives only as a TRANSITION state
until the direct-changeset path proves latency parity and conflict-UX parity on the
walking skeleton; retirement is a planned step, not an indefinite tolerance. During
the transition window the preimage-rot exposure this finding described remains
covered by the mode-independent apply-time base-revision re-check (the concurrency
ADR's correctness floor). Two execution obligations follow: (a) the plan must carry
the direct-changeset save step plus the broker-retirement gate BEFORE apply/rollback
work completes (W03.P36 territory); (b) when the self-approval ban is implemented
(the actors/provenance step), it must ban AGENT self-approval specifically — never a
blanket actor==reviewer check — or the direct human save becomes structurally
impossible. As of 2026-07-04 the shipped authoring code contains no self-approval
enforcement yet, so no contradiction exists to unwind.

### ASA-P35-review | info | W03.P35 core adapter (S174): verdict APPROVED WITH ONE REQUIRED REVISION — the fence is sound, the kill semantics are not

Phase review of `engine/crates/vaultspec-api/src/authoring/core_adapter.rs`
(2026-07-04, ~1021 lines, 17 tests). What is SOUND and should not be reopened:
the capability fence holds end-to-end — `CoreCapability` carries no
`Deserialize`/`FromStr`/serde derive, is `pub(crate)`, and `CoreInvocation`'s
fields are private so only the validating builders can mint an argv; core verb
strings live in exactly one `fixed_args` table of literals; capability selection
is a compile-time Rust choice; and the S175 disjointness tests genuinely prove
the semantic `CommandKind` wire vocabulary shares no token with any core verb.
The injection-guard grammar (token / flag-safe / doc-ref / stem / blob-hash
validators) rejects flag-shaped, traversal, absolute-path, and drive-letter
inputs before any spawn, with tests. The body rides stdin only (never argv,
tested), stdin is written and closed on a worker thread so a large body cannot
deadlock a full stdout pipe, UTF-8 is pinned into the child's env (the Windows
cp1252 mojibake guard), both an output cap and a wall-clock deadline bound every
invocation with typed `OutputTooLarge`/`Timeout` (resource-bounds satisfied),
envelope-not-exit-code branching matches the `/ops/core` write broker (a
`status:"failed"` refusal rides `Ok` for the caller to branch), and the stderr
read is capped — an improvement over the runner precedent's uncapped
`read_to_string`. The redaction surface verifies leak-free: `wire_reason`
carries only category + field + static reason; stderr/raw values/stdout survive
only in `log_detail` for operator logs, with tests covering paths, secrets, and
raw argument echo. The 17 tests exercise REAL subprocesses on both the sh and
PowerShell branches (no mocks), tripping the cap, the deadline, the crash path,
and stdin delivery deterministically.

### ASA-P35-R1 | high | REQUIRED REVISION: the no-grandchild kill rationale is false for the preferred invocation — a timed-out apply can mutate the vault after failing

`terminate()` (`core_adapter.rs:499-506`) is a bare `child.kill()` justified by
two claims that do not survive contact with the resolved invocation: (i) "we
spawn vaultspec-core DIRECTLY (never via a shell), so there is no grandchild" —
but the adapter binds `CoreRunner::detect().invocation`, whose PREFERRED
resolution is `["uv", "run", "--no-sync", "vaultspec-core"]`
(`ingest-core/src/runner.rs:392-404`): the direct child is the `uv` launcher.
On Windows (this project's primary dev OS) there is no exec, so the python core
is ALWAYS a grandchild under uv — and under the bare-PATH fallback too, since a
console-script shim exe also spawns python as a child. (ii) "on Windows
`Child::kill` terminates the subtree anyway" — factually wrong:
`TerminateProcess` kills one process; subtree termination requires a Job Object.
This claim was inherited verbatim from `runner.rs:20`, which is equally wrong —
but the runner MITIGATES it where it can: it spawns the child as a process-group
leader (`process_group(0)`, std, no new dependency — `runner.rs:235-239`) and
group-kills on Unix, for exactly the stated reason that a launcher's grandchild
inherits the stdout pipe and outlives a direct-child kill. The adapter dropped
both halves. Consequences on the WRITE path, worse than the read paths this
plumbing was copied from: after a `Timeout`/`OutputTooLarge` kill on Windows the
surviving core grandchild (a) may COMPLETE THE VAULT WRITE after the adapter has
already returned a typed failure — ledger/receipt records "failed", the document
changes afterward, preimage/rollback assumptions rot; and (b) keeps the stdout
pipe open, so the deliberately-detached reader thread does NOT "end promptly" as
the timeout-arm comment asserts (`core_adapter.rs:436-439`) — one leaked thread
plus up-to-cap buffer per timeout until the orphan exits. Required fix, still
dependency-free for vaultspec-api: mirror `process_group(0)` at spawn and reuse
the group-kill by exposing ingest-core's `terminate` (nix is already
ingest-core's dependency; vaultspec-api adds nothing); on Windows either adopt a
kill-on-close Job Object or — at minimum — correct both false comments and
CODIFY the indeterminate-outcome contract: P36 must treat `Timeout` and
`OutputTooLarge` as OUTCOME-UNKNOWN (never "not applied"), re-verifying the
document's post-state (blob hash) before recording the apply result. The
minimum bar to unblock P36 is the comment correction + Unix group-kill parity +
the indeterminate contract stated on the error variants and consumed by the
apply job.

### ASA-P35-A2 | medium | Advisory obligations for P36 (binding on the apply job, not on this file)

Four caller contracts P36 must honor, none requiring adapter changes: (1) the
adapter is SYNC and can block up to 120 s in `recv_timeout` — on the serve path
it must be entered via `spawn_blocking` (or the authoring job runner's dedicated
blocking thread), never awaited inline on an async worker; (2) forward-verbatim
(no `Envelope::parse_pinned`) is CORRECT for apply — it matches the write
broker's contract and the boundary ADR's "forwards core's envelope VERBATIM" —
but the receipt builder must read the fields it needs tolerantly and FAIL CLOSED
with a typed error when absent (never forge a receipt from a partial envelope),
and should record the envelope's `schema` string for drift forensics; (3) the
redaction guarantee holds only through `wire_reason()` — the error's `Debug`
representation contains raw stderr/values/stdout, so no `{:?}` of a
`CoreAdapterError` may reach a tiers block or any wire-bound string; (4) the
module-level `#![allow(dead_code)]` must come off when P36 wires the adapter, so
dead-code drift cannot hide behind it. One pre-existing shared trade-off, noted
not required: stderr is only drained after exit, so a child emitting more than
the OS pipe buffer (~64 KiB) of stderr mid-write blocks until the deadline
converts it to a kill — the same deferral the runner precedent makes, bounded
and typed, but on the write path it lands in the R1 indeterminate-outcome class,
which is the other reason R1's contract must be stated.

### ASA-P35-R1-recheck | info | CLEARED 2026-07-04 — every bar item verified on disk; P36 unblocks

Re-check of the R1 revision, verified against source (not the report): (1) the
child is spawned as its own process-group leader
(`core_adapter.rs` `process_group(0)` in `invoke`, with a rationale naming the
`uv run` launcher grandchild explicitly); (2) `terminate` now delegates to
`ingest_core::runner::terminate`, exposed `pub` for exactly this reuse — the
Unix group-kill (`killpg` SIGKILL) is byte-identical to the read runner's
semantics; (3) BOTH false subtree-kill comments are corrected — the adapter's
module doc and `terminate` doc, and `runner.rs:16-25`, all now state that
Windows `Child::kill` is `TerminateProcess` on ONE process and a subtree kill
needs a Job Object, deliberately not taken (dependency-free); (4) the
OUTCOME-INDETERMINATE contract is codified where it binds: variant docs on
`Timeout` and `OutputTooLarge` (never "not applied"; P36 must re-verify blob
hash post-state) plus `is_outcome_indeterminate()` returning true for exactly
those two mid-flight-kill variants, with a cross-platform test asserting the
classification over all five variants; (5) the Unix-only
`timeout_group_kills_the_core_grandchild` test is a genuine falsifier — a
backgrounded grandchild writes a marker after 2 s, a 300 ms deadline fires, and
the marker must never appear; the pre-R1 bare child-kill would fail it. Bonus
verified: the error enum now carries an explicit warning that derived `Debug`
renders the sensitive fields and must never be `{:?}`-formatted onto the wire
(pre-empting caller contract A2(3)). Honest residual, accepted: the group-kill
proof runs only under `cfg(unix)`; Windows remains the documented-limitation
path where the indeterminate contract + P36 post-state verification is the
load-bearing mitigation. Verdict: R1 CLEARED; P36 may consume the adapter under
the A2 contracts.

### ASA-P23-review | info | W03.P23 approvals: verdict APPROVED WITH ONE REQUIRED REVISION — the guardrail's SHAPE is right; its identity inputs are not yet trustworthy

Phase review of `engine/crates/vaultspec-api/src/authoring/approvals.rs` plus
the v9 store migration (2026-07-04, 9 tests). SOUND: the guardrail's shape is
exactly the mandated one — `agent_self_approval_blocker` denies IFF
`approver.kind == Agent && approver.id == author.id`, never a blanket
`actor == author`, so agent-self is denied, HUMAN self-approval of an own
proposal passes (the operation-modes `kind=direct` carve-out survives), any
distinct reviewer passes, and a System actor passes (the autonomous-mode
policy approval path stays open) — tested on all three sides at unit level plus
end-to-end agent-self-denied and human-self-permitted through a real store. The
reviewed-tuple binding (proposal revision + validation digest + policy version)
is durable, `deny_unknown_fields`, staleness-invalidated, and blocks a decision
after a redraft (tested); the V1 policy version is an honestly-labeled constant
with a written return trigger for the Increment-5 policy store. Decisions are
idempotent by replay (same reviewer + same decision returns the recorded
outcome; a conflicting decision is a typed refusal, both tested); the status
transition appends under the REVIEWER's identity with children preserved;
retention registration moves in the same unit of work (Pending → Active /
Rejected); the v9 migration carries CHECK constraints, UNIQUE(approval_id), and
proposal/changeset indexes, and is migration-tested. On disk, request-changes
is a RESERVED typed denial naming W05.P24 — the V1 approve/reject scope split
is intact (the review found the stub, not the rumored early EditProposal arc).
The store-idempotency reserve/record deferral to the P39 orchestration layer is
correct placement: domain-level replay exists here, and scoped idempotency is a
command-boundary concern per the ledger ADR.

### ASA-P23-R1 | high | REQUIRED REVISION: the blocker's "author" is the LATEST-revision actor — after approval that is the REVIEWER, so the documented P36 reuse would let the authoring agent apply its own changeset

Three identity gaps in the guardrail's INPUTS (the check itself is right):
(a) `submit_decision` derives the author as `current.actor` — the actor of the
ledger's LATEST revision (`approvals.rs:254`, over
`ChangesetAggregateRecord.actor`, which is per-revision; there is NO origin
author field). P23's own approve path then appends the Approved revision under
the REVIEWER's identity (`append_status_transition`), so from that moment
`latest().actor` IS the approver. The blocker's own doc directs P36 to "reuse
this same function against the applying actor + the proposal author" — and the
only author P36 can naturally read is `latest().actor` = the approver, so
agent A proposes, human H approves, agent A applies: blocker(A, H) passes and
the security-provenance ban on an agent APPLYING its own proposal is defeated
on the documented path. Same weakness at approve time: "author" is whoever
appended the NeedsReview revision, which is only conventionally the drafting
agent. Fix: give the ledger an origin-author accessor (first revision of the
chain, or persist an explicit author field at proposal creation), use it in
`submit_decision`, and rewrite the blocker doc to name it. (b) Delegation
laundering: `ActorRef.delegated_by` is ignored — an automated actor acting ON
BEHALF OF the author (`approver.delegated_by == author.id`, approver kind
Agent/ToolExecutor) passes as a "distinct reviewer". Deny it. (c) ActorKind
has FOUR variants; the ban tests only `Agent`, so a `ToolExecutor` — an
automated, untrusted kind — self-approving or approving its delegator's
proposal passes. Either fold ToolExecutor into the automated-self ban or deny
ToolExecutor as an approver outright. All three are a few lines plus tests in
the one blocker function; they must land before P36 consumes the blocker,
since (a)'s trap is armed by P23's own append.

### ASA-P23-A2 | medium | Advisories: target-fence staleness is a placeholder; superseded requests leave immortal Pending retention; P39 owns identity provenance

(1) `invalidate_if_stale` compares proposal revision / validation digest /
policy version but never the TARGET DOCUMENT revisions; the freshness field
`target_revisions_current` is wired to `!request.stale`, so it can never go
false from a target document moving underneath a pending approval (the
un-ledgered human direct save is exactly such a mover during the ASA-007
transition window). Correctness holds because the apply-time base-revision
re-check is the mode-independent floor — but a reviewer can approve against a
silently-moved base and only apply learns. Return trigger: when P18 makes
current target revisions readable, wire target-fence comparison into the
freshness computation. (2) A re-request with a NEW idempotency key creates a
new approval row; the superseded queued row and its `Pending` retention record
persist forever, compaction-protected — mark superseded requests closed/stale
and move their retention lifecycle. LOW volume, but the store is append-bounded
by policy everywhere else. (3) BINDING ON P39: the blocker trusts the
caller-supplied `ActorRef`; the route layer must resolve actor identity (id,
kind, delegated_by) from the authenticated session/collaborator principal —
never from a request body — or `kind: Human` is claimable and the whole ban is
cosmetic.

### ASA-P23-R1-recheck | info | CLEARED 2026-07-04 — all three identity gaps closed with falsifier tests; A2.2 folded in; P23 may commit and P36 may consume the blocker

Re-check verified on disk. (a) ORIGIN AUTHOR: the ledger gained `origin()` — the
FIRST revision by `seq ASC` over the append-only revisions table, so the
proposing author is unforgeable within the store; `submit_decision` now reads it
and passes `origin.actor` (not `current.actor`) into eligibility; the blocker
doc is rewritten to name the origin author and to warn explicitly that
`latest().actor` becomes the reviewer after approval and would defeat the P36
apply gate. The new test `self_approval_ban_keys_on_origin_author_not_latest_reviewer`
is a genuine falsifier: it drives agent-proposes → human-approves through the
real store, asserts origin=agent and latest=reviewer, then asserts the blocker
DENIES keyed on origin and would WRONGLY pass keyed on latest — the exact bug,
on the exact path P36 reuses. (b) DELEGATION: the blocker now denies an
automated approver acting ON BEHALF of the origin author
(`approver.delegated_by == origin_author.id`), while a delegate of a DIFFERENT
principal still passes as a distinct reviewer — both tested. (c) TOOLEXECUTOR:
the ban keys on `approver_is_automated = matches!(kind, Agent | ToolExecutor)`;
a ToolExecutor carrying the proposer's identity is denied — tested. The
human-self (`kind=direct`) and distinct-reviewer PASS cases are retained green.
A2.2 landed alongside: a re-request under a new idempotency key retires the
prior pending request (stale=true, retention lifecycle → Superseded) in the
SAME unit of work, tested end-to-end down to the retention row — no immortal
Pending leak. NAMING disposition: the function keeps the name
`agent_self_approval_blocker` though it now bans all automated actors and
on-behalf delegation; the reviewer's call is to RENAME to
`automated_self_approval_blocker` before the commit (the name is the doc for
future readers, P36 has not yet consumed the symbol so the rename is free, and
this project cuts over fully rather than keeping under-selling names). Verdict:
R1 CLEARED — P23 commits with the rename applied; P36 may consume the blocker,
keyed on the ledger origin author.

### ASA-P18-review | info | W03.P18 projections (S89): verdict APPROVED, no required revisions — reason ruling: absence is not staleness

Phase review of `engine/crates/vaultspec-api/src/authoring/projections.rs`
(2026-07-04, 7 tests). SOUND: a genuinely pure read — no state of its own, with
a test asserting the projection rebuilds byte-identically from durable rows
after a store reopen; the list is bounded (cap 200, probe cap+1, honest
`truncated`, tested at cap+5); eligibility is computed through the shared
`transitions` helpers, never re-derived; Applied exposes rollback through the
availability field (preimage-presence read, honest reason when missing) and no
standing lifecycle action; terminal/transient statuses serve no actions.
Advisory A2.1 is WIRED and tested: the projection re-reads each existing
target's CURRENT worktree revision against the reviewed base, surfaces a
`ConflictProjection`, and forces `target_revisions_current=false` — the
out-of-band-edit test drives a real un-ledgered worktree write and asserts both
the conflict and the denied review eligibility, closing the ASA-007
transition-window blind spot for the served view (apply-time floor remains the
independent guard). REASON RULING (the phase's open question): green's position
is CORRECT and is already on disk — absence is not staleness. Eligibility
reasons are user-facing backend-served state; a never-validated proposal must
surface "current validation record is required" (the actionable step is to run
validation), not "stale digest" (which misdirects to re-review). The
implementation is the right one-liner: `digest_current` reports an absent
current digest as current, and the outcome stays blocked because
`ValidationFreshness::blocker` checks `record_present` FIRST
(`transitions.rs:60-66`) — verified, and the NeedsReview test asserts the
missing-record reason with no "stale" text. One tolerated asymmetry, guarded by
that ordering: `validation_freshness.digest_matches_reviewed` still reports
false on absence, which is harmless only while `record_present` precedes the
digest check in every transitions blocker — a comment-worthy invariant.
Scrutiny points ruled: (1) the raw SELECTs against
`authoring_approval_requests` / `authoring_document_preimages` by
`changeset_id` are acceptable V1 (read-only, same uow, bounded LIMIT 1), but
ADVISORY: move them to typed accessors on the owning repositories
(`approvals::latest_for_changeset`, `snapshots::preimage_exists`) — the
projection's direct deserialize skips the owner's `validate_record`
schema-version check on load, and duplicated SQL against another module's table
is drift surface. (2) Unreadable-target-as-conflict is the RIGHT default:
fail-closed matches degrade-honestly; treat-as-fresh would let approve/apply
eligibility pass over a deleted or unreadable target. (3) The counts/activity
deferral to W11.P50 is sound and correctly reasoned in the module doc — a count
over a bounded page violates the wire-contract full-pre-truncation-set rule.
Observations for later phases, no action now: `list_proposals` performs a
worktree file read per child per row (bounded at 200, I/O-bound if the review
station polls — a (path, mtime) memo is the natural fix if it shows up in
latency); served eligibility is viewer-agnostic (the automated-self-approval
ban applies at decision time, so an origin agent may see an approve affordance
that submit then denies — P39 may pass the viewing actor for per-viewer
refinement); provisional-create stem collisions are not target-fenced here
(model carries `ProvisionalCollisionStatus` — Increment-scope elsewhere).

### ASA-010 | high | GAP: no actor-authentication seam exists before P39 — the self-approval ban's identity source is undecided by any ADR and unscheduled by the plan

Surfaced by the P39 route work (2026-07-04): the DTOs correctly carry no actor
field (identity must come from authentication, not a request body — advisory
A2.3), but nothing exists to authenticate WITH. Three facts compose the gap.
(1) There is no session→actor persistence anywhere before `W12.P25`
("Sessions prompt turns and recovery snapshots", `session.rs`) — three waves
after P39 — and the Increment-1 overview explicitly excludes sessions from the
walking skeleton ("no sessions, leases, LangGraph, streams"), yet `W03.P39.S192`
lists "sessions" in its vertical-slice tests: the plan contradicts itself and
leaves P39 with no identity source. (2) The engine transport authenticates at
MACHINE level (`service_token`) — one token for the whole client surface, so the
transport cannot distinguish the human from an agent process on the same
machine. (3) No ADR decides the seam: security-provenance owns the actor MODEL
and demands server-side enforcement ("not trusted from LangGraph context",
"must not assume a single trusted user forever") but never says how a caller
proves it IS actor X; the api-contract ADR explicitly leaves "transport
bindings to implementation". Consequence if unaddressed: P39 either invents an
ad hoc identity source or reads `ActorRef` from request JSON — and a client
that can claim `kind: Human` defeats the automated-self-approval ban, the
origin-author guardrail (P23-R1), the P36 apply gate, and the audit trail's
provenance in one stroke. RESOLUTION SHAPE (recommended): identity is
PER-PRINCIPAL ACTOR TOKENS over the existing P19 actor registry — issue a
bounded, hashed, revocable `actor_token` at actor registration; a route-layer
principal-resolution middleware maps bearer token → registered `ActorRef`
(id, kind, delegated_by all from the REGISTERED record, never the request);
sessions (W12.P25) later BIND to the authenticated principal rather than being
the identity mechanism, which dissolves the apparent circularity of an
Increment 1 with identity but no sessions. V1 threat model stated honestly:
machine-level transport plus per-principal tokens, human token held by the
dashboard, agent tokens injected per runtime — local-first now, multi-user
compatible later, per the ADR's own constraint. REQUIRED PLAN ADDITION (the
ASA-007-style flag): a phase (or explicit P39 sub-scope) BEFORE routes accept
mutating commands, delivering token issuance on the actors registry, the
principal-resolution middleware, rejection of any body-supplied actor field,
and a vertical test proving a body-claimed `kind: Human` cannot approve; plus
reconcile the S192 "sessions" mention with the Increment-1 no-sessions scope.
The seam choice itself is a decision to record — an amendment to the
security-provenance ADR (candidate rule:
`actor-identity-resolves-from-a-server-held-principal-seam`), authorable once
the shape is blessed.

ADDENDUM (2026-07-04, the concrete wire seam): the claimable surface is
`CommandEnvelope<T>.actor` (`api.rs:158-164`) — the SHARED mutating-command
envelope derives `Deserialize` with a first-class client-supplied `ActorRef`.
No live hole today (the envelope is used only in contract fixtures and test
deserialization; `routes.rs` is a status-only skeleton), so the danger is
entirely prospective to P39. RULING: option (b) — REMOVE `actor` from the wire
envelope entirely; do NOT keep-but-server-inject. Grounds: an accepted-but-
ignored field is a contract lie (the same class as a permanently-disabled
affordance — remove the non-capability); an override path is procedural
discipline with a one-forgotten-route bug class, while a field that does not
exist in the deserialized type is a COMPILE-TIME fence, the same philosophy
that protects `CoreCapability` (no `Deserialize` = no wire path); and with
`deny_unknown_fields` already on the envelope, removal makes any client still
sending `actor` fail loudly with a typed 4xx — the honest contract event.
Target shape: a wire `CommandEnvelope<T>` of api_version / command /
idempotency_key / payload, plus an internal `ResolvedCommand<T>` (or
equivalent) carrying the server-resolved `ActorRef`, constructible ONLY by the
principal-resolution middleware — the one place an actor identity can enter a
command, mirroring the validating-builder pattern. Outbound
`AuthoringEventDto.actor` stays (serialize-only, resolved truth). The contract
fixtures update in the same change; idempotency command scopes that include
"actor" use the RESOLVED actor. Registration/token issuance remains the
ASA-010 plan addition's first item — token→record resolution is only as
trustworthy as registration, so registering an agent (and its `delegated_by`)
is itself an authenticated, audited act.

DISPOSITION (2026-07-04): the seam decision is RECORDED — the
security-provenance ADR now carries the "actor identity resolves from a
server-held principal seam" amendment in its Implementation section and the
`actor-identity-resolves-from-a-server-held-principal-seam` codification
candidate. The plan addition (token issuance, principal middleware,
envelope-(b), reject-body, the kind:Human falsifier, S192 reconciliation)
routes to the plan-writer as one phase before P39.

### ASA-P36-review | info | W03.P36 apply (S179, commit 25a97609d6): verdict APPROVED WITH ONE REQUIRED REVISION — every binding contract holds; the gap is crash recovery

Phase review of `engine/crates/vaultspec-api/src/authoring/apply.rs` (1468
lines, 10 tests, reviewed post-commit under the commit-then-review pattern).
The binding contracts from P35/P23 all VERIFIED HELD: (1) the three-stage
lock discipline is real — the core subprocess runs with NO SQLite transaction
held (preflight uow commits, invoke runs bare, completion uow commits), with
the spawn_blocking obligation documented at both the module doc and stage B;
(2) the P35-R1 OUTCOME-INDETERMINATE contract is fully implemented AND fully
tested: on a Timeout/OutputTooLarge kill the target's post-state blob hash is
re-read and compared to the expected result — Applied ONLY on a provable
match, Failed on mismatch, Failed (fail-closed) on an unreadable post-state,
with `resolved_via_post_verify` recorded and all THREE branches driven by real
timeout subprocesses; (3) apply-authorization reuses
`automated_self_approval_blocker` keyed on `ledger.origin()`'s actor — the
P23-R1 shape, never re-derived, with an end-to-end agent-cannot-apply-own
test; (4) idempotency is head-independent (the scope deliberately excludes the
ledger head, correctly reasoned — after apply the head moves Approved→Applied
and a keyed-on-head retry would misread as Conflict), the receipt IS the
never-expiring RecordedOutcome, replay returns it verbatim (tested), and a
live reservation reports in-flight rather than re-applying (tested); (5)
single-child is refused with the honest ASA-004 capability-limit reason
(tested), and only ReplaceBody materializes in V1 (typed denial otherwise);
(6) redaction holds — diagnostics carry `wire_reason()` categories only; (7)
the receipt records base/expected/observed blob hashes plus the core envelope
status AND schema string for drift forensics (tested); retention registers the
receipt as a protected `audit_receipt` and the outbox event dedupes on the
result revision, all in the one completion unit of work. Concurrency is sound:
a second applier is excluded by the scope-level reservation or, past it, by
the lifecycle gate reading the committed `Applying` head (SQLite serializes
the write transactions).

### ASA-P36-R1 | high | REQUIRED REVISION: a crash between preflight and completion wedges the changeset in `Applying` forever — no resume/recovery path exists

The three-stage discipline creates an orphan window it does not clean up. If
the process dies (or the completion unit of work fails) after stage A
committed the reservation + `Applying` revision but before stage C committed
the terminal revision: WITHIN the 5-minute reservation TTL every retry takes
the `ReplayLookup::InFlight` arm and returns `in_flight: true` — honest for a
CONCURRENT live attempt, but after a crash there is no live attempt and no
continuation logic, so callers poll a ghost; PAST the TTL the lookup falls
through (`Expired => {}`) to the lifecycle gate, which builds the transition
`Applying → Applying` — not a legal arc (`is_apply_request_status_candidate`
admits only `Approved`) — so every retry is denied with a misleading
status-based reason, permanently. Nothing ever appends `Failed` or `Applied`
for the orphan: the changeset is wedged, un-appliable and (status ≠ Applied)
un-rollbackable, recoverable only by manual store surgery. The fix shape is
already in the file: on an EXPIRED in-flight reservation whose ledger head is
`Applying`, RESUME COMPLETION — run the same post-state re-verification the
indeterminate path uses (`resolve_outcome`'s re-verify arms against the
recorded expected blob hash) and drive `complete_in_uow` to the honest
terminal revision + receipt, marked `resolved_via_post_verify`. Alternatively
a typed recovery command may own it, but it must exist BEFORE P39 exposes
apply — a route-served apply that can wedge on an engine restart is not
shippable. (The in-flight-within-TTL crash variant heals through the same arm
once the TTL lapses, so one reclaim path suffices; a test driving
reserve→crash→TTL-expiry→retry→terminal receipt is the falsifier.)

Residuals accepted, no action: on Windows a surviving grandchild may complete
the write AFTER the post-verify read recorded Failed — an inherent race of the
kill gap; the receipt's expected/observed hashes make it forensically
identifiable and the projection's live target-fence comparison surfaces the
document movement (P18). A core that normalizes content on write (observed ≠
expected on the indeterminate path) records Failed fail-closed with both
hashes — safe side. `#![allow(dead_code)]` remains by the established pattern
until P39 wires apply; `core_adapter.rs`'s own allow can drop NOW since apply
consumes it (trivial follow-up).

### ASA-P38-review | info | W03.P38 rollback (S189): verdict APPROVED — one mechanical pre-commit change (hash the rollback id); no re-review needed

Phase review of `engine/crates/vaultspec-api/src/authoring/rollback.rs` (834
lines, 7 tests; reviewed read-only while the crate is transiently red from the
independent P36-R1 work). SOUND, ADR-conformant end to end: a rollback is a
NEW `kind=Rollback` aggregate opened in `RollbackProposed` and carried through
the CANONICAL lifecycle — the generator never applies (tested:
reviewable-not-auto-applied, and the SOURCE ledger is untouched), so the
automated-self-approval ban and the apply gates hold on rollbacks with zero
new enforcement code; the rollback's origin author is the requester, so an
agent cannot self-approve or self-apply its own rollback through the normal
path. V1 preimage-restore-only is honestly narrow: the inverse is a
whole-document `ReplaceBody` of the SOURCE preimage's payload, materialized
against the CURRENT worktree base (apply's fence re-checks), and the generator
captures an INVERSE preimage of the current content first — so a
rollback-of-the-rollback is itself possible. Every unavailable case
(not-applied source, missing child, missing/compacted preimage, non-invertible
create/rename) is a typed denial with an honest reason from the ONE shared
`create_rollback_eligibility` (the same fn backing P18's projection — no
re-derivation) plus a `ManualRepairProposal` hook — all tested. The operation
kind is authoritative from the applied record, never the caller. Idempotency
replays the already-generated rollback via the deterministic id, in one unit
of work, with an exactly-one-changeset assertion.

Scrutiny rulings: (1) the deterministic rollback id must HASH, not embed, the
idempotency key — change `rollback:{source}:{key}` to
`rollback:{blob_oid(source|key)}`, exactly the sibling precedent
`apply.rs::receipt_id_for` already sets. Three reasons: a long-but-legal key
currently overflows the 160-byte `ChangesetId` cap and fails a legitimate
request on shape alone; a client-chosen opaque key becomes a PUBLIC entity id
surfaced in every projection/event/audit record (keys are not secrets, but
publishing client strings as entity identifiers is a drift/leak smell); and
the digest keeps determinism + replay identical. REQUIRED BEFORE THE
BUNDLE-COMMIT, mechanical, no re-review needed (the P23-rename precedent).
(2) The raw preimage-id SELECT gets the same ruling as P18: acceptable V1 —
and this instance is cleaner than P18's, since it fetches only the id and
loads through the validating owner accessor (`snapshots().preimage`) — with
the same advisory: fold a typed `preimage_for_operation(changeset_id,
operation_id)` accessor onto the snapshots repository in the one cleanup that
covers P18's two sites. Observation, no action: two DIFFERENT idempotency
keys legitimately generate two coexisting pending rollbacks of one source;
whichever applies second fails the base fence (the correctness floor), and a
re-rollback after an applied rollback is likewise fence-checked — acceptable
V1 semantics worth one line in the module doc when convenient.

### ASA-P36-R1-recheck | info | CLEARED 2026-07-04 — the reclaim heal is sound, tested by a discriminating falsifier; the core_adapter allow stays until P39

Re-check verified on disk. The heal is the file's own vocabulary, no new
mechanism: `ReplayLookup::Expired` whose ledger head is `Applying` routes to
`build_reclaim_prep`, which reconstructs the `ApplyPrep` from durable truth —
the Applying revision's single materialized child (document, base hash,
expected result hash) plus the reservation's recorded receipt id (falling back
to the deterministic `receipt_id_for` over the Applying revision's
`previous_revision`, i.e. the approved source — consistent with the original
preflight). The new `Preflight::Reclaim` arm then resolves via the EXTRACTED
`post_state_resolution` — the same fail-closed matrix now shared verbatim by
the indeterminate-kill arm (Applied only on a provable expected-hash match;
mismatch or unreadable → Failed) — and drives the existing `complete_in_uow`
to the terminal revision + receipt; `record_outcome` lands on the rebuilt
(expired) reservation so a further retry Replays. No core re-invoke on the
reclaim path. AUTHORIZATION IS NOT BYPASSED: the reservation only exists
because the ORIGINAL preflight passed every gate (self-approval ban included),
and the reclaim is reachable only through the same actor+key's
`key_scope` lookup — the reclaimer IS the original applier, so attribution on
the terminal revision and receipt stays truthful. The falsifier test is
genuinely discriminating: stage-A-only crash → wedged-Applying assertion →
within-TTL retry reports `in_flight` → past-TTL retry yields a TERMINAL
Applied receipt with `resolved_via_post_verify == true` (a wrongful re-invoke
would have set `core_status` and left the flag false — the assertion
distinguishes the paths) → a further retry Replays the recorded receipt.
Suite green: 12 apply tests, 225 authoring, clippy -D 0, fmt clean (gatekeeper
lane). ALLOW(DEAD_CODE) RULING: keep the module-level allow on
`core_adapter.rs` until P39 — coder-4's empirical result refutes my "trivial
drop" premise, which wrongly assumed apply consumes the whole adapter; V1
apply consumes only the SetBody path, so the complete capability registry,
`detect()`, and the forensics accessors are lib-target-dead until P39 wires
the surface, and ~12 scattered per-item allows would be noisier and less
honest than one precisely-commented module allow matching every sibling
module's incremental-construction pattern. My earlier "trivial follow-up"
claim was wrong; the restored comment (what apply consumes, what is
P39-forward, when the allow retires) is the right form. One non-blocking
hardening note for any later touch: `build_reclaim_prep` indexes
`children[0]` on the store-internal invariant that an Applying revision only
ever exists past the operation-count gate — true today; a defensive `.first()`
with a typed error would make the invariant local. Verdict: R1 CLEARED — the
bundle-commit (apply.rs R1 + core_adapter.rs comment + P38 with the id-hash)
may proceed; P39 unblocks on the plan-side ASA-010 prereq.

### ASA-010-review | info | Identity-seam security review (pre-commit): verdict APPROVED — all four fences hold; ASA-010 stays authoring-only and P39 mounts it

Pre-commit security review of the ASA-010 principal-auth seam
(`principal.rs`, `actor_tokens.rs`, `api.rs` envelope-(b), store v10
migration). (1) COMPILE-TIME FENCE HOLDS: `AuthenticatedPrincipal` is a
newtype with a PRIVATE field, no public constructor, no `Default`, no serde,
no `From` — within the crate only `principal.rs` itself can construct one, and
the only construction site is `resolve_principal` (token-store read; id/kind/
delegated_by from the REGISTERED record). `ResolvedCommand<T>` has private
fields and exactly one constructor, `from_principal(AuthenticatedPrincipal,
CommandEnvelope<T>)`, and carries no serde `Deserialize` — the two bypass
classes that would kill the fence (a deserializable resolved type, a
constructible witness) are both structurally absent. `Clone` on the witness is
sound (cloning an already-resolved identity). (2) WIRE FENCE HOLDS:
`CommandEnvelope` is actor-less with `deny_unknown_fields`, and the falsifier
test drives a literal body-claimed `{"actor":{"kind":"human"}}` through serde
and asserts the unknown-field rejection names `actor`. (3) TOKEN STORE HOLDS:
raw token is 32 bytes of OS CSPRNG (getrandom) hex-encoded, returned exactly
once; only the hash is stored (the unsalted fast hash is correct here — a
256-bit-entropy secret needs no salt, and the SQL hash-equality lookup leaks
nothing useful); lifetime is clamped to the 90-day bound with non-negative
issuance time; revocation is idempotent and preserves the original revocation
stamp; `resolve` refuses unknown, expired, and revoked identically as
`UnknownPrincipal` — correctly COARSE (no oracle for which), distinct only
from `MissingToken`, matching the ADR's two-layer denial contract; every
issuance records `issued_by`. The v10 migration carries UNIQUE(token_hash), an
actor index, no raw-token column anywhere, and is migration-tested. (4) THE V1
ADMINISTER-POLICY SHAPE IS HONEST: no permission module exists (P19 shipped
registry + provenance), so the `V1_ADMINISTER_POLICY_HOLDER` constant with the
machine token as sole holder, route-gated issuance, recorded `issued_by`, and
a written RETURN TRIGGER (narrow the holder set when the permission module
lands) is exactly the forward-composing bootstrap the ADR amendment decided.
SCOPE RULING: agreed — ASA-010 delivers the seam and its fences,
authoring-only; the axum layer, `FromRequest` wiring, AppState store, and
route mounting are P39's route-enablement. That split is not merely
convenient: delivering the fence TYPES first means P39's wiring is
compile-time forced through them. P39-binding obligations restated: the
principal middleware runs AFTER the machine `bearer_gate`; the issuance route
is machine-bearer-gated and records `issued_by`; the raw token never reaches a
log or audit record (hash only). Advisories, non-blocking: `revoke` takes the
RAW token only, so an operator cannot revoke a LOST/compromised token — add a
revoke-by-actor (revoke-all-for-principal) admin verb at the routes surface;
token rows per actor are unbounded in count (each row is expiring and
issuance is admin-gated — acceptable; a later janitor can prune long-expired
rows).

### ASA-P39-forks | info | P39 CHUNK B rulings: contract scope corrected for driveability; denials-are-values decided (ADR-amended); proposal_id derived

Three rulings for the P39 command-route slices (2026-07-04). FORK 1 (contract
scope): the coders' principle is RIGHT — exposing un-fixtured verbs is an
incidental contract extension and forbidden — but the proposed scope
(fixtured verbs only: CreateProposal + Review decision + Apply + Rollback)
fails the increment's own exit gate: without a wire path from Draft to
NeedsReview (validation + submission + an opened approval request), a client
can NEVER drive the walking skeleton end-to-end — a created proposal sits in
Draft forever and the review/apply/rollback routes serve nothing. The
CORRECTED scope: the fixtured verbs PLUS a deliberate, minimal contract
extension that this ruling constitutes and the api-contract ADR already
names in its V1 proposal-command list ("submit for review, validate"):
fixture + DTO `submit_for_review` — whose route composes validation and the
approval-request opening server-side (note `request_approval` is NOT an
ADR-named wire verb; it is domain plumbing the submit route drives) — with
the implementer's latitude to ALSO expose `validate_proposal` as its own
fixtured verb if the composition proves awkward (both shapes blessed; agents
benefit from a standalone validate, the skeleton does not require it).
`CreateProposalRequest` already carries the complete single-child draft, so
append/replace-draft, cancel, supersede, and rebase genuinely defer to the
reviewed contract-extension increment — they are ADR-decided but
fixture-deferred, and the skeleton does not need them. Non-negotiables:
every exposed verb gets a fixture + Deserialize DTO under the coverage
guard, and the exit-gate flow (create → submit → approve/reject → apply →
rollback) must be driveable over the wire. FORK 2 (error taxonomy): option
(a), but shaped as ALIGNMENT rather than taxonomy — verified on disk that
`proposal.rs::ensure_allowed` (line 780) encodes eligibility DENIALS as
`StoreError::Ledger` while approvals (`submit_decision` → Ok with denied
eligibility) and apply (`Preflight::Denied` → Ok outcome) already return
denials as VALUES; proposal.rs is the one inconsistent module, so the root
fix is realigning it to the sibling pattern (denials ride the success
envelope as denied `ActionEligibility`; errors are reserved for faults) —
after which `StoreError::Ledger`'s ~18 serialization/IO sites are PURELY
infra and map honestly to a server-fault status with no enum split needed.
Where an `ensure_allowed` site genuinely cannot return an outcome, the
scoped split (`LedgerDenied` vs `Ledger`) is the fallback for exactly those
sites. Option (b)'s lossy interim map is REJECTED: the wire-contract rule
makes the refusal/fault distinction load-bearing, and a "temporary" 5xx for
a policy refusal teaches clients wrong retry semantics. DECIDED AT
ADR-WEIGHT: the api-contract ADR now carries the "denials are values;
errors are faults" amendment with the category map (infra→server fault,
invalid payload→validation fault, idempotency conflict→conflict) and the
explicit ban on mapping a possible backend fault to a client-fault status.
SIDE RULING (proposal_id bridge): DERIVED, deterministically from
`changeset_id` — the client never invents identity, matching the
receipt-id/rollback-id hashing precedent; V1 is 1:1
changeset↔proposal. RETURN TRIGGER: when rebase/supersession lands
(W13.P28), proposal identity may need its own minting per generation — the
derivation is revisited there, not silently stretched.

### ASA-P39-review | info | W03.P39 slice (9 commits → 8c333fb006): verdict APPROVED WITH ONE REQUIRED FOLLOW-UP BUNDLE — rulings implemented faithfully; the walking skeleton is wire-driveable

Slice review of `authoring/http.rs` (+ DTOs, proposal realign, mount, e2e).
FAITHFUL TO THE RULINGS: F2 denials-are-values is real — eligibility refusals
ride the 200 success envelope via `denial_snapshot`/`proposal_result_response`,
and `command_error_response` maps only genuine faults (Idempotency/
StaleRevision/Snapshot→409, Validation/Approval→422, Actor/ActorToken→403,
`Ledger` now PURE infra→503 with the reason SUPPRESSED — leak-safer than the
minimum asked). F1 scope is exact: create + submit (the route COMPOSES
validate + approval-open server-side; `request_approval` never a wire verb) +
review-decision + apply + rollback + the machine-gated issuance seam; deferred
verbs untouched; coverage guard green. The id bridge is the blessed shape:
`derive_proposal_id`/`derive_approval_id` hash via `blob_oid`, and apply
CROSS-CHECKS the wire `approval_id` against the derived one — load-bearing
coherence, exactly right. ASA-010 obligations honored: principal middleware
layered on the nested router AFTER the app bearer gate, permissive for reads,
enforcement at the `ResolvedCommand` extractor (which reads identity from
extensions BEFORE consuming the body, with missing/unknown/store-unavailable
kept distinct: 401/401/503); issuance is machine-bearer-gated, records
`issued_by` (`system:bootstrap`), registers the actor active, returns the raw
token exactly once, and V1-refuses delegated principals — a SAFE NARROWING of
the ADR (no delegation laundering is even expressible in V1); apply runs the
whole sync command under `spawn_blocking` with a panicked-join mapped to a
TYPED INDETERMINATE (never a forged outcome) — the A2 contracts all land. The
composed submit is self-healing under the SAME idempotency key (per-step
composed keys replay each stage).

### ASA-P39-R1 | medium | REQUIRED FOLLOW-UP BUNDLE: inert-field cutover, the partial-submit wedge heal, and the real-applied e2e leg

Three items, one coder pass. (a) INERT-FIELD CUTOVER (flags 1+2 ruled by the
same principle as the CommandEnvelope.actor removal — accepted-but-ignored
wire fields are contract lies): `ReviewDecisionRequest.reviewed_revision`
becomes LOAD-BEARING — cross-check it against
`approval.reviewed.proposal_revision` and refuse on mismatch (a reviewer
deciding from a stale UI snapshot must learn "the proposal changed under
you", the approval-gates freshness UX); DROP `interrupt_id` (it returns with
the LangGraph increment's deliberate contract extension —
`deny_unknown_fields` makes re-adding an explicit event); DROP
`ApplyRequest.targets` (V1 apply = `{changeset_id, approval_id}` — the
derived-approval cross-check plus the apply-time core fence already pin
correctness, and the shipped fixture's TWO-child targets contradict V1
single-child anyway); slim `RollbackChildSource` to `{source_child_key}`
(target + materialized_revision are re-derived by the domain). Fixtures
update in the same change. (b) PARTIAL-SUBMIT WEDGE HEAL: the submit
composition runs three units of work; a crash between the submit step and
the approval-open leaves NeedsReview WITHOUT an approval request, and a
retry under a FRESH idempotency key then denies at the validate step
(NeedsReview is not validatable) — wire-unrecoverable. Cheap heal, enabled
by the deterministic ids: when the head is already NeedsReview with no
approval request for the derived proposal id, the submit route skips to the
approval-open step instead of denying. (c) REAL-APPLIED E2E (flag 3 ruled
YES): scaffold the `.vaultspec` workspace in the e2e temp so CI exercises a
REAL `vaultspec-core` applied receipt — the walking skeleton's entire point
is the vertical slice against reality, and the deepest integration (the
set-body arg contract against a real workspace) is otherwise never
end-to-end tested; skip-if-core-absent is acceptable environment gating, a
faked core is not, and the existing honest failed-receipt branch stays as
the degraded-environment case. Advisories, non-blocking: the review-decision
handler could assert the loaded approval record's id equals the path id (a
cheap coherence check, unreachable divergence in V1's derived-id world); the
principal middleware opens the authoring store per tokened request
(acceptable V1; a resolution cache is the later fix if it shows in latency).

### ASA-P39-R1-recheck | info | CLEARED 2026-07-04 — all three items verified on disk; P39 DONE, Increment 1 closes end-to-end

Spot-check of the R1 bundle (e4b44c1864 + 86425119d1). (a) INERT-FIELD
CUTOVER verified: `reviewed_revision` is load-bearing — the review handler
compares it to `approval.reviewed.proposal_revision` and refuses a mismatch
as the new `StoreError::StaleReview` → typed 409 `authoring_stale_review`
("you reviewed a stale snapshot"), never a 5xx; `interrupt_id` is gone from
the DTO; `ApplyRequest` is `{changeset_id, approval_id}` with the
contract-lie rationale in its doc; `RollbackChildSource` slimmed; fixtures
updated with contract-guard assertions; the advisory approval-id coherence
assert is folded in. (b) WEDGE HEAL verified: `resume_submit_in_review` —
a NeedsReview head replays when the derived approval exists and, in the
crash window (no approval), opens it from the RECORDED validation digest
under a deterministic resume key; the honest error covers the
no-validation-record edge; the heal grants no new authority (it completes
an already-gated submit; review and apply gates are untouched — the same
reasoning that cleared the P36 reclaim), with the
`a_wedged_submit_needsreview_without_approval_heals_on_resubmit` test. (c)
REAL-APPLIED E2E verified: the e2e scaffolds a genuine `.vaultspec`
workspace (offline `vaultspec-core install --target`, uv-first with a PATH
fallback), and branches honestly — an operable core REQUIRES
`child_outcome=applied` + a generated rollback (confirmed run in two
environments), an absent core degrades to the failed-receipt branch, and
the core is never faked; the earlier degrade's root cause (missing `date`
frontmatter — real set-body refuses an invalid doc) is fixed and documented
at the fixture. Verdict: R1 CLEARED — W03.P39 is DONE, and with it
Increment 1 (the walking skeleton) closes: issue-token → create → submit →
approve/reject → apply (real core write) → rollback, wire-driveable end to
end under the full identity, idempotency, and denial contracts.

### ASA-P40-diff-ruling | info | P40 scope call: populate `materialized_operation` in the DETAIL projection — the diff is in-phase, not an expansion

Ruling (2026-07-06): option (b). Grounds: the P40 phase text itself names the
"diff view reusing the existing reader/diff machinery", so populating the
designed-but-empty `materialized_operation` slot (hard-coded `None` in the
projection) COMPLETES the phase — the option needing justification was
shipping without it; and a reviewer who cannot SEE the change is a rubber
stamp, not the human-in-the-loop the approval-gates and operation-modes ADRs
are built on. Three bounds on the fill: (1) DETAIL projection only
(`project_proposal`, one proposal) — never the bounded 200-item list, whose
rows must not carry document bodies; if the shared child DTO would leave the
list serving a permanently-`None` field, make the population detail-only by
shape or document it as detail-only, not a silent asymmetry; (2) the served
`payload_text` respects an explicit size bound consistent with the
api-contract ADR's "bounded document content" (truncate with an honest flag,
never an unbounded serve); (3) the DIFF itself stays CLIENT-RENDERED
presentation over the backend-served base + new texts — per the
change-format ADR, diffs are derived review artifacts and never authority,
so no server-side diff computation is owed. This is a deliberate
served-projection-shape contract event, recorded here.

### ASA-P40-review | info | W03.P40 review station (S199, 6 commits → 4d332ef462): verdict APPROVED — no required revisions; all three diff bounds honored; the human-click-deny proof is live

Phase review. THE RULING'S BOUNDS ALL HONORED, verified in the diff: bound #1
BY SHAPE — bodies live only on the new detail-only `ProposalDetailProjection`
(`review_documents` of `ReviewDocumentProjection`), the 200-row list never
carries them, and the `list_projection_never_carries_document_bodies` guard
test pins it; bound #2 — both texts ride `BoundedDocumentText` under a 128 KiB
per-text cap with char-boundary truncation, an honest `truncated` flag, and
total/returned byte counts; bound #3 — the backend serves only the two texts
(no hunks), and the client's new `diffLines` (a compact LCS line diff, capped
at 3,000 lines per side since no diff library exists in-repo) renders the
presentation — consistent with the ruling and the change-format ADR. The
REQUIRED identity enrichment landed as ruled: `approval_id` / `proposal_id` /
`reviewed_proposal_revision` on `ApprovalStateProjection`, sourced from the
record in hand, on both routes (small identity fields). The frontend honors
the architecture rules: `authoring.ts` is the SOLE wire client for the
`/authoring/v1/*` family (tiers-only degradation, the typed
`authoring_store_unavailable` kind, denials surfaced as `denied` OUTCOMES
never error toasts); the ReviewStation renders SERVED eligibility directly
(reason as the disabled title) and never re-derives it; the live test drives
the load-bearing acceptance over the REAL wire — two distinct principals,
agent self-approval returns a `denied` VALUE on the 200 envelope, and the
HUMAN reviewer's reject lands with the served queue reflecting `rejected`.
THE THREE DEVIATIONS ACCEPTED: (1) the wrapped detail shape
`{proposal, review_documents}` is a clean deliberate contract event (no
external consumer asserted the bare shape); (2) the client `diffLines` util is
exactly bound #3's consumer; (3) the SectionCard-in-StatusTab mount follows
the post-redesign rail (tabs retired, Figma 599:2099) and the rag
console-in-a-section precedent, with no panel-schema change. LOW observations,
no action owed: `review_document` silently skips a child whose base is
unreadable — the conflict projection carries the reason elsewhere, but an
explicit base-unreadable marker on the detail would be more honest for the
panel; the LCS table at the 3,000-line cap is ~9M cells (a transient
tens-of-MB worst case — an `Int32Array` row table or a Myers diff cuts it if
it ever shows in profiling); `eligibilityForRender` filters fresh per render
over query data (plain render derivation, not a store selector — compliant).

### ASA-P21-review | info | W10.P21 approval policy matrix (S104, 1f9ead07f7): verdict APPROVED — no required revisions; defer-the-reroute-to-P48 CONFIRMED with a one-authority bar; two forward-wiring advisories

Phase review of `policy.rs` (713 lines, 9 tests, pure functions over
arguments — no state to bound). FAITHFUL TO THE ADR CLUSTER: the three modes
are named policy bundles with an autonomy rank; the session override is
narrowing-only with a WIDENING override IGNORED and recorded (both the
`session_override_ignored` flag and the served reason say so); the
destructive floor is absolute across all three modes (matrix-tested);
rollback is destructive BY KIND exactly as the operation-modes ADR lists it,
create is non-destructive exactly as the ADR's assisted class names it, and
an empty operation set fails CLOSED; `reviewer_eligibility` REUSES
`automated_self_approval_blocker` (the P23-R1 single authority, never
re-derived); `system_auto_approval_eligibility` is the distinct fact done
right — System-actor-only, `SystemAutoApprovable`-requirement-only, an
Agent/ToolExecutor can never wear the system hat (tested); the
stale-condition classifier reuses `ApprovalFreshness` in the blocker's
precedence and treats a MISSING record as absent-not-stale (consistent with
the P18 absence-is-not-staleness ruling); `PolicyDecisionProjection` is the
served why with `deny_unknown_fields` and a tamper test; request-changes is
REPRESENTED, not invented. BOUNDARY CALL CONFIRMED: the approvals.rs reroute
defers to W10.P48 — it is a contract event touching the load-bearing ban +
freshness contracts P36 apply consumes, and the built-then-wired pattern
(transitions→approvals, core_adapter→apply, principal→routes) has carried
every prior phase; the policy is consumed at P48, so the seam changes once,
reviewed once. ONE BAR ATTACHED for the P48 review: after wiring, BOTH lanes
— the human decision path and the system auto-approval — must derive their
requirement from `decide_changeset_approval` (one policy authority); a
system-only consultation that leaves the human path's requirement hardcoded
would fork the matrix. TWO FORWARD-WIRING ADVISORIES, no action in P21:
(1) `tool_permission_requirement` is mode-INDEPENDENT and human-gates every
Mutating tool call, while its own tier doc notes a mutating tool is "still
gated by CHANGESET approval downstream" — under autonomous mode this makes
every proposal-producing tool call queue a human interrupt, i.e. autonomy in
name only; before W12 wires tool interrupts, either make the tool gate
mode-aware (an assisted/autonomous policy entry auto-permitting Mutating,
with Dangerous always human) or document the double gate as deliberate
defense-in-depth — reconcile the comment and the classification either way.
(2) `reviewer_eligibility` accepts ANY CommandKind, but the shipped
approvals.rs path invokes the ban only on the APPROVE arm — an agent
REJECTING its own proposal (withdrawal) is deliberately legal (P23); if P48
wires `reviewer_eligibility` uniformly over decisions it would silently
tighten self-reject into a denial — a behavior divergence to catch at the
P48 review; a doc line on `reviewer_eligibility` scoping it to
approve/apply-class commands closes the trap cheaply.

### ASA-P48-review | info | W10.P48 modes.rs (adopted, a0cddea9c3): the one-policy-authority bar HOLDS; auto-approve/auto-apply ride the canonical paths; mode-set denies agent principals

Delta review of the adopted `modes.rs` (1,300 lines) + its
approvals/transitions/http deltas. THE ASA-P21 BAR IS SATISFIED:
`decide_changeset_approval` is the ONLY requirement derivation in the tree —
consumed by `maybe_auto_approve` and by the served policy projection
(`projections.rs:1202`); the human decision path needs no requirement check
by construction (a human approval satisfies every requirement), and no
parallel matrix exists. Auto-approval is the ADR's shape: it consults the
policy, checks `system_auto_approval_eligibility`, and records the approval
through the CANONICAL `approvals::submit_decision` under the system actor
with the mode policy id + version in the decision comment, plus a durable
`SystemPolicyApprovalRecord` marker — no bypass arc on the approve side.
Autonomous auto-apply reuses `apply_changeset` verbatim (system actor as
applier — ADR-conformant; the blocker correctly passes System kind; the
receipt attributes the system), under `spawn_blocking` with a
deterministically derived idempotency key. The after-the-fact lane is a
bounded marker listing joined on applied heads; acknowledgement is
append-only and idempotent (a review is acknowledgement, not a gate). The
mode-set route (`POST /v1/mode`) DENIES Agent/ToolExecutor principals — an
agent cannot self-enable autonomous mode — and mode changes are
actor-attributed, audited events effective only forward. The `stale_reason`
addition to approvals is additive, serde-tolerant, and honestly categorized.

### ASA-P48-R1 | medium | REOPENS P48: the kill-switch requeue appends UNDECLARED lifecycle arcs (Approved→Draft→NeedsReview) with no transition-eligibility check, under the system actor's authorship

`requeue_system_approvals` (modes.rs) implements the downgrade kill switch
by, per not-yet-applying marker: staling the old approval (correct, and the
ADR's stated mechanism), then appending TWO synthetic ledger revisions —
`Approved→Draft` then `Draft→NeedsReview` — directly via
`ledger().append_revision` under the SYSTEM actor, with no transitions
vocabulary backing (the transitions.rs delta adds only CommandKind scopes,
no arcs) and no eligibility helper consulted. Three defects in one: (a) the
operation-modes ADR's load-bearing constraint is a SINGLE lifecycle — "never
a bypass arc... or every projection, event, and rollback path would need
mode-conditional logic" — and a return arc no declared grammar produces is
the same disease in reverse: P50 projections and the P33 event stream can now
carry `Approved→Draft` transitions nothing else can legally emit; (b)
`Approved→Draft` is a provenance distortion — nothing was re-drafted, and
the revision chain now shows the system actor authoring draft states; (c)
every sibling path (P23 approve, P36 apply + reclaim) checks a transitions
eligibility helper BEFORE appending — this is the one append site with no
check, breaking the discipline that keeps the grammar closed. FIX SHAPE:
declare ONE kill-switch return arc — `Approved→NeedsReview` ("policy
requeue") — in the transitions vocabulary with an eligibility helper
(legal only for a system actor over a staled system-approved head), append
exactly that single revision, drop the synthetic Draft hop, keep the
stale-marking and the marker/requeue-id mechanics unchanged (those are
sound: hashed requeue ids, downgrade-only trigger, idempotent by marker).
Tests update to assert the single declared arc.

ADVISORIES on the P48 delta, no reopen: (1) the ADR's per-session NARROWING
override is represented in policy.rs but wired NOWHERE — `maybe_auto_approve`
passes `None` and sessions carry no override field; a plan step should
schedule it (an agent session that should be forced more-manual currently
cannot be). (2) Mode-set is administer-policy-class in the permission model;
the Human|System kind gate is V1-honest (single operator) — record the same
return trigger as token issuance: narrow to administer-policy holders when
the permission module lands. (3) `mode_after_submit` maps a post-submit
mode-step fault to a full error response although the submit COMMITTED —
the idempotent retry heals it, but a partial-outcome response would be more
honest. (4) `mode_rank` duplicates policy's private `autonomy_rank` —
expose one.

### ASA-P49-review | info | W10.P49 direct_write.rs (adopted): the unified write path does NOT bypass the floor — every gate rides the canonical machinery

Delta review of the adopted `direct_write.rs` (1,960 lines). THE ASA-007
SHAPE IS REAL: a human editor save composes create-proposal → validate →
submit → HUMAN SELF-APPROVAL through the canonical `submit_decision` (the
operation-modes carve-out — the approver is the human author, which the
blocker correctly permits) → the SAME `apply_changeset` with the
`--expected-blob-hash` base fence — no second materializer, no gate skipped,
preimage and receipt riding the normal apply. Agents are DENIED at the top
with the ADR's exact reason ("agents must propose changesets"); only
ReplaceBody is expressible, so no destructive op can ride the direct path.
The optimistic conflict contract is preserved three-deep (pre-check,
refreshed re-check, and the apply-fence refusal mapped to a `Conflict`
status with the full expected/actual/target hash triple). Idempotency
replays by (actor, key) with a request-digest mismatch conflict; composed
step keys make every sub-stage independently replayable. The route is
capability-gated FAIL-CLOSED (default disabled; unparseable capability file
= disabled; a test pins the 503 `authoring_direct_write_disabled`), runs
under `spawn_blocking`, and the legacy `/ops/core` comparison is genuinely
ISOLATED — a temp worktree holding only a `.vaultspec` copy plus the one
document, Drop-cleaned, driven through the bounded adapter — measurement
evidence for the ADR's latency-parity retirement gate, never a second live
write.

### ASA-P49-R2 | medium | REOPENS P49: `dual_run` is an accepted-but-ignored capability (the comparison tax cannot be switched off), and the ledger kind deviates from the ADR's decided `kind=direct` vocabulary

Two items, one fix pass. (a) `DirectWriteCapabilities.dual_run` is NEVER
consulted: `execute_direct_write` takes no capabilities and calls
`compare_legacy` unconditionally on every enabled save (even conflicting
ones) — a per-save `.vaultspec` copy plus a core subprocess, the exact tax
the flag exists to retire once parity is proven. Setting `dual_run: false`
today does nothing — the accepted-but-ignored contract-lie class. Fix:
thread the capabilities into `execute_direct_write` and run the comparison
only under `dual_run` (and skip it on the early conflict path). (b) The
operation-modes ADR's decided vocabulary is "the editor's save command
creates a `kind=direct` changeset"; the implementation mints
`ChangesetKind::Authoring` and records directness only in the
`authoring_direct_write_records` side table (the model delta adds
CommandKinds but no ChangesetKind) — letter-vs-code drift on ADR-decided
vocabulary, and "who changed this and why" needs a side-table join to know
a changeset was a direct save. Resolve EITHER direction, explicitly: add
`ChangesetKind::Direct` (additive, the surface is young) and mint direct
saves with it, OR the ADR is amended to record the marker-table
representation as the chosen shape with its reasoning — the drift, not the
choice, is the defect. Advisories, no reopen: the capabilities file is
production-enabled only by hand-editing JSON under `.vault/data/
authoring-state/` (only `write_for_tests` writes it) — an acceptable
transition-state ops story, but an admin route/setting seam should own it
eventually; the synthetic "direct-write" session's bounding rides on the
P25 session store (checked in that phase's review).

### ASA-P30-P31-review | info | W12.P30 langgraph.rs + P31 tools.rs (adopted): boundaries honored; both banked advisories TRANSFER to P22 (the pending permission flow)

Delta review, phase 3 of the adopted batch. P30 `langgraph.rs` is a
mapping-only adapter exactly as the langgraph-integration ADR demands:
LangGraph thread/run/checkpoint references map ONTO existing authoring
sessions and runs — execution state never becomes product history; errors
split a public message from a 500-char-capped REDACTED diagnostic; an
unconfigured runtime degrades to a typed `Unavailable`, never a guess. P31
`tools.rs` is the semantic tool catalog done right: a FIXED tool vocabulary
(`SemanticToolName::ALL`) whose every entry aliases an EXISTING
`CommandKind` (thin-aliases-over-the-same-domain-commands, api-contract
ADR); inputs are `deny_unknown_fields` with explicit bounds (search cap
8/50, query 512 chars, context 16/64 KiB); risk tiers and permission
requirements are DECLARED per tool from the one policy source. The
`/v1/agent-tools/prepare` route is honestly prepare-ONLY — it validates and
echoes the dispatch alias, executes nothing, and its doc names the
remainder (durable permission requests, interrupt resume, executable
tool-call records) as later phases — so the catalog's
`permission_requirement` metadata is declared-forward truth, not an
unenforced lie. BANKED-ADVISORY DISPOSITION: (1) `reviewer_eligibility` is
consumed NOWHERE outside policy tests — the self-reject-outlawing trap
never fired; the doc-scope line still lands at P22. (2) The mode-aware
Mutating-gate question TRANSFERS to P22 (permissions.rs, unbuilt): when the
permission flow is built it must either make the Mutating tier mode-aware
(assisted/autonomous auto-permit Mutating; Dangerous always human) or
document the double gate as deliberate — and reconcile the tier doc either
way. NOTE for P22's grounding: `ProposeChangesetInput` declares
Append/Replace variants — the F1-deferred WIRE verbs — in the served
catalog; executing them at P22 through the EXISTING domain handlers
(`append_draft`/`replace_draft` shipped in W03) is ADR-consistent (tools
alias domain commands; the F1 deferral was the command-envelope wire
surface), but until execution exists the catalog advertises operations no
route can run — close that gap at P22, in whichever direction.

### ASA-P25-P33-P34-P50-review | info | Sessions, events, stream, and count projections (adopted): bounds, identity, and wire-contract all hold — batch review complete

Delta review, phase 4 (final) of the adopted batch. P25 `session.rs`: every
accumulator bounded at creation (session list cap 50 default / 100 max,
prompt text 64 KiB, recovery snapshots capped at 20 turns + 20 runs, every
listing SQL LIMIT-ed); all mutating session routes (create / prompt-turn /
cancel / resume) take identity through `ResolvedCommand` — sessions BIND to
the authenticated principal exactly as the ASA-010 amendment decided, and
the direct-write module's synthetic session rides this same bounded store.
P33 `events.rs`: a lifecycle-event VOCABULARY layered on the existing
bounded outbox — no new accumulator, no ad-hoc event names at mutation
sites, schema-versioned with version-mismatch rejection tested. P34
`stream.rs`: replay pages capped at 128 with `last_seq` resumption. P50
projections: the counts/activity remainder lands exactly as the W03.P18
module doc promised — corpus-wide counts computed over the FULL durable
corpus before any list cap (the wire-contract full-pre-truncation-set rule),
with a test seeding past the cap and asserting totals beyond the page;
activity pages carry their own cap + truncation metadata. The store
migration delta follows the house pattern (per-table DDL with indexes,
version-bumped, migration-tested). BATCH VERDICT (all four phases): the
adopted WIP is architecturally faithful to the ADR cluster with TWO
medium reopens — ASA-P48-R1 (undeclared kill-switch requeue arcs) and
ASA-P49-R2 (ignored `dual_run` capability + the `kind=direct` vocabulary
drift) — plus advisories banked on P22 (mode-aware Mutating gate,
reviewer_eligibility scope, catalog-advertised deferred verbs) and the
plan-gap advisories from P48 (session narrowing override unwired;
mode-set's administer-policy return trigger). Nothing in the batch bypasses
the approval floor, the identity seam, or the apply-time correctness
contracts.

### ASA-P22-review | info | W12.P22 tool permissions (038361007f + b1532239df): core sound; both transferred advisories landed as directed; fold-in-3 deferral to P32 CONFIRMED

Phase review of `permissions.rs` (896 + 108 lines) and the policy delta. THE
CORE IS SOUND: a tool-permission request is keyed by tool call and DISTINCT
from changeset approval (a permitted tool still produces a proposal that
rides the full matrix); the decision window is bounded at creation (5-minute
default TTL, saturating arithmetic) and an undecided request EXPIRES rather
than blocking a run forever; `granted()` is fail-closed — auto-permitted
read tool or explicit approve ONLY; a claim is coordination, never authority
(claimed-but-undecided is still not granted); replay is idempotent by tool
call with conflicting-second-decision refused; a human decision on an
auto-permitted tool is a no-op replay ("never a second authority");
retention is registered; migration v14 follows the house pattern; the
`Permission → 422` taxonomy arm is consistent. THE POLICY DELTA (the flagged
new review event on policy.rs) is exactly the directed shape:
`tool_permission_requirement_in_mode` — ReadOnly always auto, DANGEROUS
always human in every mode (the dangerous floor, matrix-tested), Mutating
human under manual and auto-permitted under assisted/autonomous with the
double-gate rationale in the reconciled tier doc; the mode-independent
baseline delegates to `_in_mode(tier, Manual)` (behaviour-preserving); the
request threads `scope_mode + session_override` through
`resolve_effective_mode` and RECORDS the effective mode for provenance
(narrowing-only, the input source being the scheduled P25 session-field plan
step); `reviewer_eligibility` is doc-scoped to approve/apply-class naming
the exact self-reject trap. FOLD-IN-3 DEFERRAL CONFIRMED to W12.P32: the
tool route is prepare-only for EVERY verb (my own P31-approved
declared-forward framing), so no execution seam exists for ANY verb —
Append/Replace are no more advertised-unrunnable than Create, and closing
execution-honesty per-verb at P22 would either build P32 early or regress
approved aliases. BAR FOR THE P32 REVIEW: every catalog verb executable (or
honestly absent), and the execution surface must enforce `granted()` before
running any non-ReadOnly tool — the permission plane only becomes real when
the executor consults it.

### ASA-P22-R1 | high | REOPENS P22: nothing enforces WHO may decide a human-gated tool permission — the requesting agent could approve its own Dangerous request

`submit_decision` (and `claim_permission`) check only `ensure_active` on the
reviewer: NO kind requirement and NO self-decision ban. The requirement
being decided is literally `HumanApprovalRequired`, yet any active Agent or
ToolExecutor is an acceptable reviewer — including THE REQUESTER ITSELF: an
agent requests a Dangerous tool, then approves its own request, and
`granted()` returns true — the dangerous floor becomes agent-self-approvable
and the permission plane is cosmetic. LATENT today (no routes mount the
flow; the P22 http delta is only the error-taxonomy arm), but the campaign's
own standard (P23-R1: the domain layer owns the authority check, never
future route vigilance — one forgotten route defeats a route-level check)
makes this a required revision BEFORE any route or executor consumes the
flow. FIX SHAPE: in `submit_decision` — and mirror on `claim_permission` —
for a human-gated request require `reviewer.kind == Human` (System is
deliberately NOT eligible here: a system actor deciding a
HumanApprovalRequired tool would be "wearing the reviewer hat", the exact
thing the security-provenance ADR forbids; system authority over tools is
the auto-permit lane the mode policy already owns), AND deny a reviewer
whose id — or whose `delegated_by` — equals the requester's id (the
automated-self shape from `automated_self_approval_blocker`, reused or
mirrored, never re-derived loosely). Falsifier tests: agent-self-decide
denied; ToolExecutor-delegate-of-requester denied; System denied; a distinct
HUMAN approves.

### ASA-P22-F1-lift | info | Fold-in-3 SUPERSEDED: F1 lifted for append/replace via real routes (743da6df16) — confirmed as a clean partial, with ONE mechanical fixture item owed

Ruling on the wire-contract addition. The F1 lift for append/replace ONLY is
CONFIRMED as a deliberate, reviewed contract event: both verbs are in the
api-contract ADR's V1 proposal-command list (ADR-decided, fixture-deferred —
exactly the F1 framing), the boundary "the wire exposes exactly what the
catalog advertises" is coherent (cancel/supersede stay deferred because the
catalog does not advertise them), and superseding the P32 deferral is right —
the routes need no executor, and the Create-pattern mirror (real
command-envelope route + advisory prepare alias) is the shape I named
ADR-consistent. The implementation is sound: `DraftProposalRequest` already
carried `deny_unknown_fields`, so gaining `Deserialize` makes it a legitimate
wire DTO; the shared `mutate_proposal_draft` enforces path/body changeset
coherence; identity rides `ResolvedCommand`; denials-as-values and the error
taxonomy map through the standard helpers; idempotency stays with the domain
handler; and the lib.rs mount proof asserts both mounted AND principal-gated
(401-not-404 on a machine-bearer-only request). ONE MECHANICAL ITEM OWED
(the P23-rename class — required before the P22 slice closes, no re-review
needed): the TWO `ROUTE_FIXTURES` entries for the new endpoints (method,
path template, command, mutating, idempotency_required, negative contract
cases). F1's non-negotiable was fixture + DTO per exposed verb; the DTO half
landed, but the declared/tested wire inventory in api.rs does not know these
routes exist — the coverage guard passes vacuously (it checks family
coverage, and Proposal already has create), which is precisely the
silent-divergence channel the fixture inventory exists to close. Minor
convention note, not required: the wire DTO lives in proposal.rs rather than
api.rs (the DTO home) — fine while the type is shared verbatim; move it if
the wire and domain shapes ever diverge.

### ASA-Rfix-recheck | info | CLEARED 2026-07-07 — combined spot-check of the R-fix batch (587fd614b9 + 0dfcd7368a); P48/P22 close; P49 closes at the v15 minting checkpoint

All five items verified on disk. P22-R1: `tool_reviewer_authority_blocker`
gates BOTH `claim_permission` and `submit_decision` — Human-kind required
(System correctly denied by the kind check — no reviewer-hat), requester and
delegate-of-requester denied, auto-permitted exempt, denials riding the
success envelope as values. P48-R1: the kill switch now appends through ONE
declared arc — `policy_requeue_transition_eligibility`
(`Approved → NeedsReview`) checked before the append — with tests asserting
the direct hop AND that no system-authored Draft revision exists (the
provenance-distortion falsifier); `autonomy_rank` deduped. P49-R2(a):
capabilities are threaded into `execute_direct_write`, `compare_legacy` runs
ONLY under `dual_run` (legacy → `Option`), with both directions tested
(recorded when on, skipped when off — the default-off path pinned).
P49-R2(b) vocabulary: `ChangesetKind::Direct` lands with
`is_authoring_like()` whose doc names the THREE semantic classes verbatim
from the review bar (authoring-like behaviour / is-Authoring-specifically /
is-not-Rollback) and mandates per-site decisions; the transitions sites use
EXPLICIT `Authoring | Direct` match arms — the exhaustive-match discipline
bar, met better than a helper-in-match would (a future kind addition breaks
the compile); `changeset_risk` keys on `== Rollback` (class 3), so Direct
correctly classifies by max-over-ops. The two append/replace
`ROUTE_FIXTURES` entries land with their `AppendDraft`/`ReplaceDraft`
CommandKinds — the F1 fixture half closed. DEFERRAL ACCEPTED: `Direct`
MINTING is a dedicated v15 checkpoint (the ledger's `changeset_kind` CHECK
constraint needs a recreate-style migration — data-risk-bearing, correctly
isolated for focused review); the vocabulary is runtime-safe unminted.
Verdict: P48-R1, P49-R2(a)+(b)-vocabulary, P22-R1, and the fixtures item ALL
CLEARED; the v15 migration + minting + round-trip test is the one remaining
review event before P49 fully closes.

### ASA-v15-recheck | info | CLEARED 2026-07-07 — the v15 migration meets the bar; P49 CLOSES; one required-lite rider (the Direct guard is REACHABLE, so it gets its unit test)

Isolated review of 69eb54b83a. MIGRATION SAFETY MET, and the FK trap was
caught exactly right: a rename-only recreate would leave
`authoring_changeset_child_operations`' foreign key dangling at the dropped
parent, so BOTH tables are recreated in dependency order — every column
copied verbatim (including the v8 actor-provenance quartet and explicit
`seq`), the child FK rebuilt against the new parent, old tables dropped
child-first, `sqlite_sequence` rebuilt for both, all three parent indexes
plus the child index recreated, and the CHECK widened to
`('authoring','direct','rollback')`; validated against populated store/
ledger/direct-write suites. MINTING is keyed to the direct-write composition
only (`create_direct_proposal` consumed by `execute_direct_write`;
`create_proposal` unchanged, zero caller churn), and the round-trip test
asserts `kind=Direct` in the LEDGER (no side-table join — the ADR's
self-describing goal, delivered) plus rollback-source legality over the
applied Direct changeset (review site a). RULING ON THE HONESTY NOTE: the
dedicated unit test IS required — as a required-lite rider on the next
coder-proj pass, not a P49 blocker, because the guard is verified present and
correct. The "unreachable path" argument has a hole: a CRASHED direct save
(proposal minted `kind=Direct` in Draft, crash before the self-approval step)
leaves a Draft Direct changeset that a client can push through the GENERIC
submit route — nothing gates `POST /proposals/{id}/submit` on kind — and that
composition ends in `maybe_auto_approve`. On that side path the guard is
LOAD-BEARING: without it, assisted/autonomous mode would land a SYSTEM
approval on a human's own partially-composed save. Rider: a
`maybe_auto_approve`-refuses-Direct unit test (the modes test builder gains a
kind parameter; one denial assert), and the guard comment's "the direct-write
flow never routes here" softened to name the crashed-draft submittability.
Verdict: v15 CLEARED — W10.P49 CLOSES; the R-fix campaign over the adopted
batch is complete (P48 ✓, P22 ✓, P49 ✓) with the one rider riding P32.

### ASA-P32-review | info | W12.P32 interrupts + executor gate (037da87764 + e7cbab5f5d): verdict APPROVED — the banked executor bar is met at the decision layer; one P44 bar banked

Phase review. THE EXECUTOR BAR IS MET: `tool_execution_gate` is a pure
decision over the tool's risk tier plus the looked-up permission record —
ReadOnly runs freely; Mutating/Dangerous run ONLY when the permission
EXISTS and `granted()` (the P22 plane made real), with DISTINCT honest
denials for missing-request vs ungranted, riding denials-as-values; the
four-way gate matrix is tested (read-only free / mutating refused-without /
mutating runs-with / dangerous holds regardless). RESUME-BY-ID AND REPLAY
SAFETY are exemplary: `InterruptRecord` is keyed by a stable `interrupt_id`
(never position); `record_interrupt` replays a re-raise without a second row
and never resets a resolved interrupt to pending; `resolve_interrupt`
replays an already-resolved id with the RECORDED decision unchanged
(`updated_at` untouched — never re-decides) and faults on an unknown id;
simultaneous interrupts resolve independently by id, and the record survives
a store reopen — all tested. RETENTION: a pending interrupt registers
protected product state so it outlives LangGraph checkpoint pruning;
resolution moves it to Active as the decision audit. `ToolCallRecord`
snapshots the executor-gate outcome per tool call, idempotent by
`tool_call_id`, with AuditReceipt retention. The v16 migration is exactly
the directed shape: TWO FRESH ADDITIVE TABLES (no CHECK-widen, no recreate),
CHECK-constrained enums, UNIQUE business keys, run + state indexes. The
catalog-honesty half of the original P32 bar was already closed at P22 (the
append/replace routes), so this phase's scope is coherent. ONE BAR BANKED
FOR P44 (the LangGraph run loop): the gate is only as real as the executor
CALLING it — P44 must route every tool call through `tool_execution_gate`
and record the `ToolCallRecord` before execution; a run loop that skips the
gate re-inertifies the permission plane. LOW advisory, documented behavior
accepted: a second resolve carrying a DIFFERENT decision payload silently
replays the first (the doc says so; the ADR's idempotent-resume requirement
is met) — if lost-update masking ever matters, a conflict signal is the
upgrade.

### ASA-P44-review | info | W12.P44 bounded generation channels + transcript compaction (d333f1491d): verdict APPROVED — the compaction-protection contract holds at BOTH layers

Phase review. THE DESIGN CALL IS CONFIRMED: a bounded, NON-AUTHORITATIVE
serving contract reusing the existing retention compactor — not a new
durable frame ring — is exactly what the streaming-events-outbox ADR
demands (raw token/trace frames non-authoritative; truth recovered via
lifecycle replay / tiered snapshot), and it avoids a needless v17 table.
THE PROTECTION CONTRACT HOLDS AT TWO INDEPENDENT LAYERS, both verified at
source: (1) `due_compactable_records`' SQL structurally selects ONLY
`retention_class IN ('generation_transcript','review_material')` AND
`lifecycle_status IN ('rejected','superseded','expired')` (terminal) AND
`payload_state='full'` AND `protected=0` AND past-due — pending approvals
(protected), rollback preimages (`RollbackMaterial`, not in the class
list), audit receipts, and non-terminal records are excluded BY THE QUERY;
(2) `compact_record` independently blocks any protected record with a
`SkippedProtected` marker (an audit trail of the refusal), and
`compact_due` passes `allow_rollback_limitation: false` so rollback
material is blocked even on the direct path — defense in depth. The sweep
is bounded (max 64 per run, one pass, remaining reported as
`limited_count`, the run recorded); the live test drives a terminal
past-due transcript to Summarized WHILE a co-located pending-approval
protected record stays Full. The serving bounds are honest: the 256-frame
hard cap with an EXPLICIT `dropped` count (never a silent clip);
`authoritative: false` is served load-bearingly at both the block and
per-subchannel level with the cursor aligned to the LIFECYCLE recovery
point, so a client structurally cannot mistake a truncated window for
truth; the recovery path stays read-only (the compaction hook is a
mutation, correctly kept out of it). ONE LOW NOTE, no reopen:
`compact_generation_transcripts` is built-then-wired — nothing DRIVES the
sweep yet (no janitor/route caller), so due transcripts accumulate as
due-but-unswept until the driver lands; name the owning phase for the
sweep scheduler so the compactor becomes real (the same built-then-wired
discipline every prior seam followed, just worth a named owner).

### ASA-P41-A1-review | info | W12.P41 checkpoint A1, the executor seam (6ffb726b91): verdict APPROVED — the run-loop bar HOLDS at one un-skippable seam; three A2-binding directives

Security review of `executor.rs` alone, as designed. THE RUN-LOOP BAR HOLDS:
`execute_tool_call` is the one atomic step — idempotency short-circuit first
(a terminal call replays, never re-dispatches); ReadOnly gates through
`tool_execution_gate(None)` and RECORDS before Dispatch (even reads are
audited); Mutating/Dangerous resolve-or-open a Pending permission, gate over
the record, and on allow WRITE THE RECORD BEFORE the Dispatch disposition —
with the concurrent-write guard (an existing record replays as
AlreadyHandled, never double-dispatch); an undecided permission SUSPENDS
(stable-id interrupt + AwaitingPermission + deliberately NO terminal record,
so a later grant re-drives the same tool_call_id — the suspend-not-refuse
insight is exactly right, a terminal Refused would wrongly short-circuit the
grant); a decided rejection or lapsed window is a terminal recorded refusal.
Dispatch only names `SemanticToolName::command()` — no new execution
surface; denials are values; the requester is documented as the ASA-010
principal. Test matrix covers read-free, suspend-no-dispatch+interrupt,
suspend→grant→dispatch→replay-idempotent, reject→terminal→replay-stays.

THREE A2-BINDING DIRECTIVES (not A1 reopens — each lands naturally with the
routes): (1) DESIGN POINT 1 RULED — at-most-once is blessed as the A1 FLOOR
(never double-apply is correct for a security seam), but A2 must upgrade it
to effectively-once, and the architecture already pays for the upgrade: the
api-contract ADR MANDATES every mutating command be idempotent precisely so
"LangGraph interrupts and network retries can replay work" — so the A2 route
derives the mapped command's idempotency key DETERMINISTICALLY from
`tool_call_id`, and then the replay disposition for a PERMITTED record can
safely return Dispatch (re-drive) instead of AlreadyHandled: a completed
dispatch replays the command's recorded outcome, a crash-lost dispatch runs
fresh — the permitted-but-lost window HEALS, no completion flag or two-phase
record needed (Refused replays stay AlreadyHandled). The at-most-once
lost-call class would otherwise be permanent and operator-invisible. (2)
DESIGN POINT 2 RULED — the interrupt-id fallback is REACHABLE, not
near-unreachable: a long-but-valid `ToolCallId` plus the
`interrupt:tool/` prefix can overflow `InterruptId`'s length cap, and then
TWO different suspended calls COLLIDE on the shared "unnamed" sentinel —
`record_interrupt`'s idempotency makes the second call replay the FIRST
call's interrupt, so the human's resolve targets the wrong tool call and the
second waits forever. Fix by the established hashing precedent:
`interrupt:tool/{blob_oid(tool_call_id)}` — bounded, collision-free,
matching every other derived id; plus a long-id test. (3) LOW — lazy expiry:
the not-granted arm matches `queue_state`, so a Pending-but-past-TTL record
(never touched by a decide or sweep) suspends instead of terminally
refusing; it heals when a human touch or the W14 janitor flips it, but one
`expire_if_due` call (or `is_expired` check) before the match is the honest
line. All three ride the A2 pass; I review them with the routes.

(Banking note, 2026-07-08: the route work split into A2 = the two thin
security routes and A3 = `/execute` + the 7-command dispatch; all three
directives above bind at A3, where `execute_tool_call` and arbitrary client
tool_call_ids become reachable.)

### ASA-P41-A2-review | info | W12.P41 checkpoint A2, the thin security routes (6642ea8f46): verdict APPROVED — every checklist item verified through the wire

Review of the two thin routes against the agreed checklist, all verified on
the committed diff. `POST /v1/agent-tools/{tool_call_id}/permission-decision`
REUSES `submit_decision`, so the P22-R1 `tool_reviewer_authority_blocker` is
enforced VERBATIM — never re-derived at the route — and the wire test proves
it end-to-end: an agent self-decision returns a 200 DENIED value whose reason
names the human requirement (denials-as-values through the real router +
principal middleware). `POST /v1/interrupts/{interrupt_id}/resume` reuses
P32's `resolve_interrupt` unchanged — the second resolve of the same id
serves `replayed: true` over HTTP, never re-deciding. Both routes take
identity through `ResolvedCommand` (the ASA-010 seam); faults map through the
shared taxonomy with the precise statuses (unregistered actor 403,
unknown/not-permitted 422). THE F1 LIFT IS COMPLETE THIS TIME: two new
`EndpointFamily` variants, two `deny_unknown_fields` DTOs, two
`ROUTE_FIXTURES` entries with path templates + commands, and fixture arms —
the fixture half landed WITH the routes (the append/replace lesson held).
The `AggregateRef::Session` classification for the fixture arms avoids an
unnecessary enum expansion — acceptable bookkeeping, not a wire shape. No
findings. A3 (`/execute` + the seven dispatches) is next, carrying the three
banked directives, the one-impl-per-command reuse mandate, the inherited
caller contracts, and the executor's `allow(dead_code)` removal.

### ASA-P41-A3a-recheck | info | CLEARED 2026-07-08 — all three seam directives implemented to spec (e8e3bb9f1a); end-to-end look rides A3b

Code review of the directive commit (executor.rs only; A3b `/execute` still
to come). (1) EFFECTIVELY-ONCE: `replayed()` now RE-DRIVES a permitted record
— disposition `Dispatch` with `replayed: true` — while a refused record stays
terminal (`AlreadyHandled`); the concurrent-terminal-write branch routes
through the same path so a race re-drives rather than dropping; the module
doc names the deterministic-key contract the A3b caller must honor; and the
replay of a record whose stored `tool_name` fails `from_wire` degrades to
`AlreadyHandled` — a safe fallback, never dispatching an unknown command.
Tested: the retry returns `Dispatch(CreateProposal)` + `replayed: true`.
(2) INTERRUPT ID: `interrupt:tool/{blob_oid(tool_call_id)}` — bounded,
collision-free, from the established id-derivation source — with construction
failure PROPAGATED as a typed error and the shared "unnamed" sentinel
DELETED; the reachability falsifier drives two 150-char (valid) tool call ids
whose raw-prefix form would have overflowed, asserting two DISTINCT
interrupts. (3) LAZY EXPIRY: `expire_if_due` runs after resolve-or-open and
before the gate, so a Pending-past-TTL permission terminally refuses instead
of suspending (tested at ttl=5). `#![allow(dead_code)]` correctly REMAINS
until A3b wires the seam. Verdict: A3a CLEARED as code; the combined
end-to-end verification (directives exercised through `/execute`, the
deterministic command key at the route, the reuse mandate, the caller
contracts, the F1 lift + fixture, and the dead-code removal) is the A3b
review.

### ASA-P41-A3b-review | info | W12.P41 checkpoint A3b, /execute + the 7-command dispatch (495f0256d9): verdict APPROVED — every staged item verified; the executor surface is complete

Focused review of the dispatch commit. THE STAGE DISCIPLINE HOLDS: the seam
(`execute_tool_call`) runs in its OWN unit of work — the gate outcome and
`ToolCallRecord` are DURABLE before any dispatch executes outside it (the
P36 record-then-act pattern); the seam is keyed by the `tool_call_id`
itself, so retries under different envelope keys converge on the same
permission/interrupt records. DIRECTIVE 1 END-TO-END: the deterministic
bounded command key (`agent-tool-execute:{blob_oid(tool_call_id)}`, typed
error on failure) applies at the COMMAND level, so the seam's
permitted-replay re-drive dedups a completed dispatch through command-layer
idempotency and heals a crash-lost one — effectively-once, delivered.
ONE-IMPL-PER-COMMAND VERIFIED: every dispatch arm routes to the SAME
factored body the dedicated route calls — `dispatch_draft_mutation`
(append/replace), `validate_proposal_from_worktree` (shared by BOTH the
submit composite's validate step and the standalone validate — a bonus
dedup), `submit_for_review_composed`, `apply_changeset_body` — with
`draft_request_from_alias` as the single alias-conversion site and no
duplicated resolution. CALLER CONTRACTS SURVIVE THE DISPATCHER:
`apply_changeset_body` runs apply under `spawn_blocking` internally, and the
submit composite receives the command key as its BASE with its own
`step_key` sub-derivation untouched (no double-keying), keeping
`mode_after_submit` autonomous-parity through the shared composite. READS:
the gate records the permitted `ToolCallRecord` and the route serves the
prepared read descriptor with NO command execution (`unreachable!`
defensive in the dispatcher). Principal via `ResolvedCommand`;
awaiting/refused/already-handled ride 200 as values with a null result. THE
F1 LIFT IS COMPLETE WITH THE ROUTE: `EndpointFamily::AgentToolExecute`, the
run-scoped `ROUTE_FIXTURE` with negative contract cases, the fixture arm,
and the `AggregateRef::Changeset` classification. `executor.rs`'s
`#![allow(dead_code)]` is REMOVED now that `/execute` wires the seam — the
last directive item closed. LOW observations, no action: the route passes
`session_override: None` (the known unwired plan-gap advisory — consistent,
not new); the polymorphic route's single fixture entry names a
representative command (`CreateProposal`) — one entry cannot name seven,
and the negative cases carry the contract. With A1/A2/A3a/A3b all cleared,
the P41 executor surface is COMPLETE; checkpoint B (the LangGraph fixture
riding these routes) is the phase's remaining exit gate.

## Recommendations

The superseding-ADR set this audit grounds — five documents, each hardened by the
findings above:

1. **SUP-1 `authoring-v1-walking-skeleton`** (supersedes the plan's wave sequencing
   and narrows apply-materialization's V1 execution scope, per ASA-002/ASA-004):
   V1 apply is SINGLE-CHILD (multi-doc schema retained, multi-child apply refused
   with a typed error); the plan is re-sequenced around one vertical slice —
   propose → validate → submit → approve/reject → apply via the existing live
   `/ops/core` edit verbs as the adapter's first capability → whole-document
   preimage rollback — reusing the shipped W02 store primitives; the compensation/
   staged-materialization subsystem (W08.P37) and `partially_applied`/
   `compensation_required` statuses move behind a core batch-transaction filed
   upstream.
2. **SUP-2 `authoring-operation-modes`** (new, per ASA-005): operation mode as
   backend policy data — manual / assisted (auto-apply per recorded non-destructive
   policy class) / autonomous — with mode scope, the system-actor approval record,
   the lifecycle path of an auto-approved changeset, an after-the-fact review lane
   (inspect + roll back applied-autonomously work), kill-switch/downgrade, and the
   interaction with stale-approval rules. This is the decision that makes the
   user's "delivered autonomously" flow a first-class capability instead of a
   stretched exception clause.
3. **SUP-3 `authoring-scope-consolidation`** (per ASA-003/ASA-008): demote
   multiagent-composition, document-chunk-management, and live-editing-room to
   explicitly deferred; fold the chunking pair into one document; collapse the V1
   review-queue to four states; restrict the rollback matrix to preimage restore
   with honest unavailable-reasons; centralize each shared rule (idempotency,
   stale triggers, self-approval ban) in the ledger ADR with references, not
   restatements.
4. **SUP-4 `engine-boundary-refinement`** (per ASA-006): land the promised
   `engine-read-and-infer` amendment — the authoring domain owns durable WORKFLOW
   state and never writes `.vault/` documents; core remains the sole document
   writer — as a codified rule before W04 makes the ledger load-bearing.
5. **SUP-5 `unified-write-path`** (per ASA-007): decide whether the human editor's
   direct save becomes a mode=direct auto-approved changeset (one ledger, one
   history, one rollback story — recommended, and natural under SUP-2) or dual-path
   is accepted with a codified fence covering ledger blind spots and preimage
   invalidation.

Sequencing: SUP-4 is unblocking and immediate; SUP-1+SUP-3 reshape the plan before
W04 starts; SUP-2 and SUP-5 are the two genuinely NEW decisions and deserve their
own research-grounded ADR cycle. Nothing already shipped (W01–W02) is invalidated by
any of the five — the store primitives, contract grammar, and model vocabulary all
survive; what changes is what gets built NEXT and what the corpus claims is decided.
