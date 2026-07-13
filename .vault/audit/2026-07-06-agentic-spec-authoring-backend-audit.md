---
tags:
  - '#audit'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` audit: `W10 P21 approval policy matrix review`

## Scope

W10.P21 approval policy matrix review for `policy.rs` and the surrounding
authoring projection and approval boundary. The review checked the accepted
operation-modes, approval-gates, and security-provenance decisions against the
implemented policy matrix, test coverage, and whether backend-served review
state can expose mode, risk, requirement, and reason without frontend inference.

W10.P48 system-actor auto-approval, after-the-fact review lane, and kill-switch
review for the mode execution layer, submit/apply route composition, durable
review projection, stale-policy evidence, and frontend review-station lane.

## Findings

### w10-p21-policy-projection-not-served | high | resolved policy decision projection is wired into served review state

The W10.P21 reviewers found that `policy.rs` defines the operation-mode policy
matrix and `PolicyDecisionProjection`, but the backend review projection still
serves only the existing proposal, approval, conflict, and generic eligibility
state. No non-test caller uses `decide_changeset_approval`, so the frontend
cannot render the backend-owned mode, risk, approval requirement, or reason that
S101 and S105 require.

Resolved in the W10.P21 fix pass: the proposal projection now includes the
backend-computed `PolicyDecisionProjection` from the policy module, and the
frontend store/render path consumes the served policy block directly. Follow-up
review confirmed no W10.P48 execution behavior was introduced.

### w10-p21-tool-gate-as-denial | medium | resolved human-gated tool permission is no longer modeled as request denial

The W10.P21 reviewers found that `tool_permission_eligibility` returns a denied
`RequestToolPermission` action for mutating and dangerous tool tiers. The
approval-gates ADR distinguishes a tool request that requires a human gate from a
request that is refused; if used as written, the helper would prevent the
permission request from entering review instead of representing the required
human gate as policy data.

Resolved in the W10.P21 fix pass: mutating and dangerous tool permission
requests now remain requestable and carry a human-approval reason, instead of
being refused outright.

### w10-p21-frontend-sparse-policy-inference | medium | resolved sparse frontend policy fallback synthesized policy

The follow-up reviewer found that the frontend adapter initially defaulted a
missing `policy` block to manual/destructive/human-required values and rendered
that unconditionally. That would make a sparse or stale wire response look like a
backend-served policy decision. The adapter now preserves absence as absence, the
card renders no policy label unless the backend served one, and tests cover both
served and absent policy cases.

### w10-p21-reviewer-role-boundary | low | accepted reviewer helper is broader than the human-required policy wording

The review noted that the raw self-approval helper permits a distinct agent
reviewer, while the W10.P21 human-required approval requirement says an eligible
human approval is required. This is accepted as non-blocking for W10.P21 because
this phase records policy data and projection, not the full approval-decision
rewiring. The later approval-decision wiring must combine the policy requirement
with actor-kind eligibility rather than treating "not self" as the whole
reviewer rule.

### w10-p48-submit-retry-after-auto-apply | high | autonomous submit replay can fail after the first request auto-applies

The W10.P48 implementation composes submit-for-review first, then runs
`mode_after_submit`, where autonomous mode can create the system approval and
call the normal apply path in the same HTTP request. A client retry with the
original submit idempotency key no longer sees a `NeedsReview` head, because the
first request may have advanced the changeset to `Applied`.
`submit_for_review_composed` only has a replay/resume branch for a
`NeedsReview` head; otherwise it rebuilds validation and submit scopes against
the current latest revision. Because proposal idempotency is scoped by expected
revision and request digest, the retry can report an idempotency conflict or
transition denial instead of replaying the successful submit/auto-apply result.

This breaks the route-level idempotency expected for the autonomous path. The
S218 tests cover the lower-level mode transition, but they do not cover retrying
the submit route after the first autonomous submit has already auto-applied.

Resolved in the S219 fix pass: submit composition now replays a same-key submit
whose approval-open step already exists and whose changeset head has advanced
beyond review. The replay is bound to the original approval idempotency key, so
a different submit attempt cannot inherit an old approval. The regression test
drives create, submit, advances the ledger to `Applied`, and retries the same
submit route key.

### w10-p48-after-fact-diff-erased | high | after-the-fact review can show no textual change after auto-apply

The after-the-fact lane reuses the normal proposal card and diff panel, which
fetches proposal detail from the backend. The `review_document` projection
builds the displayed base from the current worktree snapshot and the displayed
proposed text from the materialized target snapshot. For an already-applied
autonomous changeset, the current worktree snapshot is the target state, so the
rendered diff can collapse to "No textual change" even though the stored
materialization contains the original preimage and review diff.

That leaves the after-the-fact lane without the diff/review evidence required by
the operation-modes ADR and S216 execution notes. The S218 frontend test checks
lane metadata and rollback affordance, but it does not expand an
applied-under-policy item and assert that the original diff is still visible
after apply.

Resolved in the S219 fix pass: proposal detail now builds review base text from
the stored preimage payload attached to the materialized operation, not from the
current worktree body. A regression test mutates the real worktree document to
the proposed target body before reading detail and asserts that the served base
still comes from the durable preimage.

### w10-p48-kill-switch-stale-reason | medium | downgrade requeue does not surface policy-version staleness

The S216 execution record calls out that a policy downgrade stale reason should
be surfaced as policy/version staleness rather than frontend-inferred state. The
implementation requeues eligible system approvals by marking the old approval
`stale=true`, appending a new `NeedsReview` ledger revision, and opening a
replacement approval request. The approval freshness projection still derives
stale approvals as target-revision freshness failure, while policy-version
freshness compares the reviewed approval policy version only to the static
approval-policy constant. The frontend therefore only receives a generic stale
boolean and renders "Review is stale"; it cannot distinguish a kill-switch
policy downgrade from target-revision drift.

This weakens the kill-switch audit trail and does not satisfy the explicit
S216/S218 expectation for policy-version stale evidence. The changed tests cover
that downgrade requeues the item, but they do not assert a policy/version stale
reason on the served review state.

Resolved in the S219 fix pass: approval records and projections now carry an
optional backend-authored `stale_reason`; the kill-switch downgrade sets the old
system approval to `policy_version_changed`, and the frontend renders the served
reason as policy-change state rather than deriving it from status.

### w10-p48-followup-kill-switch-stale-reason-hidden | medium | downgrade stale reason is still not served on the requeued review item

The S219 fix records `policy_version_changed` only on the old system approval
that the kill-switch downgrade invalidates. The same requeue path immediately
opens a replacement human approval, and the review projection serves the newest
approval row for the changeset by insert sequence. After the replacement exists,
the served review item carries the replacement approval with `stale=false` and no
`stale_reason`, so the frontend does not receive or render the backend-authored
policy-version stale reason for the downgrade requeue.

This leaves the original W10.P48 issue partially unresolved: the durable old
approval has the correct audit fact, but the review-station projection still does
not surface policy-version staleness on the item the reviewer sees after the kill
switch. The regression coverage also stops at the old approval record and a
synthetic frontend render case; it does not project the requeued changeset and
assert that the served review state exposes `policy_version_changed`.

Resolved in the follow-up S219 fix pass: the mode repository exposes a
backend-authored policy requeue reason for changesets with requeued system
approvals, the proposal projection overlays that reason onto the served
replacement approval, and the frontend renders a served stale reason even when
the replacement approval itself remains actionable. The downgrade test now
projects the requeued changeset and asserts that the served review state carries
`policy_version_changed`.

### w10-p49-direct-write-ungated-capability | high | direct write is advertised and callable without the required backend flag

The W10.P49 plan and S221 checklist require the direct editor-save path to be
behind backend-owned feature or capability state, with flag-off preserving the
legacy `/ops/core` editor behavior. The current implementation mounts
`/authoring/v1/direct-writes` unconditionally in `http.rs`, the route always
executes `execute_direct_write` once called, and `response.rs` hardcodes both
`direct_write` and `direct_write_dual_run` to `true`. No backend-owned flag or
authority-mode state is read by the route or status snapshot, while the frontend
save seam still calls the legacy `opsCoreWrite("set-body")` path. That makes the
served capability surface untruthful for the transition state and gives clients
no backend-served way to know whether direct write, dual run, or legacy behavior
is authoritative.

Resolved in the S224 fix pass: direct-write capability state is now read from a
backend-owned runtime capability file under `.vault/data/authoring-state/`, the
route checks that state before store or core execution, and the status response
serves `direct_write`, `direct_write_dual_run`, and `direct_write_authority`
from the same backend state. The disabled default preserves the legacy editor
path and does not create direct-write records. Follow-up route/status review
found no remaining medium-or-higher issue.

### w10-p49-direct-write-conflict-idempotency | high | conflict outcomes are not bound to the direct-write idempotency key

`execute_direct_write` only replays when `authoring_direct_write_records` already
has a row for the actor and idempotency key, and that row is only inserted after
the direct path reaches a terminal applied or failed result. Stale
`expected_blob_hash` conflicts and direct-save denials return success-envelope
domain outcomes without recording either a direct-write row or a shared
idempotency outcome; the S223 conflict test explicitly asserts that no marker is
created. Retrying the same stale-save key after the live document later matches
the old expected blob can therefore re-evaluate and apply instead of replaying
the original conflict and legacy-comparison evidence. That violates the V1
mutating-command replay contract and the W10.P49 requirement that idempotency
bind direct creation, approval, apply, and parity evidence.

Resolved in the S224 fix pass: direct-write records now persist terminal conflict
and agent-denial value outcomes, so retries replay the original value rather
than re-evaluating against a later worktree state. The conflict regression now
mutates the worktree back after a stale save and proves the same key still
replays conflict without applying.

### w10-p49-direct-write-route-coverage | medium | tests bypass the HTTP and status integration they claim to verify

The S223 real-behavior tests call `execute_direct_write` directly, which covers
the domain composer but bypasses the mounted HTTP route, `ResolvedCommand`
extraction, actor-token middleware, command-kind rejection, tiered response
envelope, and status capability surface. The API tests parse the
`DirectWriteRequest` fixture, and the response test only asserts existing
proposal/apply capability flags, not `direct_write` or `direct_write_dual_run`.
There is no direct-write route test for success, conflict, agent denial, wrong
command kind, or flag/capability truth, and no frontend/store test consuming
backend-served direct/parity status. The current coverage therefore does not
prove the route/API/status/store integration claimed by S222/S223.

Resolved in the S224 fix pass: HTTP tests now post through `authoring_router`
with real actor-token middleware, proving the disabled capability gate, enabled
agent-denial value response, wrong-command rejection, tiered envelopes, and
status capability surfacing. Response tests also cover disabled and enabled
direct-write capability snapshots.

### w10-p49-direct-replay-payload-underbound | high | completed direct-write replay does not compare the save payload

The direct-write entrypoint checks `authoring_direct_write_records` by actor and
idempotency key before validating the incoming `DirectWriteRequest`. That table
does not store a request digest, and its replay key is only `(actor_id,
actor_kind, idempotency_key)`. After one direct save is recorded, a later request
from the same actor with the same key but a different `doc_ref`, body, or
`expected_blob_hash` returns the old `DirectWriteOutcome` as a replay, bypassing
the lower proposal/apply idempotency digest checks. A client can therefore be
told that a different save applied even though the requested document/body was
not written. The S223 replay test covers only an identical-payload retry.

Resolved in the S224 fix pass: direct-write records now store a request digest
for the `DirectWriteRequest`, and replay compares the incoming digest before
returning the stored outcome. A reused key with a different document/body/hash
now returns an idempotency conflict instead of replaying the old result.

### w10-p49-post-check-conflict-shape | medium | post-preflight base drift is not returned as the direct conflict value

The direct-write path returns a `DirectWriteConflict` only when the document is
already stale at the initial snapshot check. If the base changes after that
check, the composed validate step can surface a `StoreError::Snapshot` 409 fault
after proposal/preimage state may already exist, or the final core apply can
record a failed apply receipt that becomes `DirectWriteStatus::Failed`. Neither
path returns the direct-write conflict value shape with `actual_blob_hash`, no
direct-write marker, and editor-style optimistic conflict UX. This leaves an
untested race against the operation-modes requirement that the unified human save
reuse the existing `blob_hash` conflict behavior.

Resolved to the transition-state floor in the S224 fix pass: the direct path now
refreshes the document after proposal creation and maps detected drift into a
persisted `DirectWriteConflict` value. Apply-time stale eligibility is also
translated into a direct conflict value where the apply layer reports stale/base
denial. The follow-up idempotency/conflict reviewer found no remaining
medium-or-higher issue in this scoped path.

### w10-p49-direct-write-status-frontend-gap | medium | direct-write capability status has no frontend store consumer

S225 scopes frontend/store verification for the Increment 2 demo and the
direct-write status surface. The review queue wire is covered: the store adapts
`applied_under_policy`, rollback availability, and approval stale reasons, and
the render tests exercise the after-the-fact lane, rollback button, and policy
stale label. The separate direct-write capability/status wire is not covered by
that adapter. Backend `/authoring/status` now serves
`capabilities.direct_write`, `direct_write_dual_run`, and
`direct_write_authority`, but `frontend/src/stores/server/authoring.ts` has no
status query or typed status adapter, and the scoped frontend tests contain no
consumer assertion for those capability fields. That means the direct-write
status surface cannot be verified through the frontend store boundary, and S225
closure should either add the adapter/test or explicitly rule the status surface
backend-only for this increment.

Resolved in the S225 fix pass: `frontend/src/stores/server/authoring.ts` now has
a typed `AuthoringStatus`/`AuthoringStatusCapabilities` adapter, a
`GET /authoring/status` client method, a status query key, and
`useAuthoringStatus`. `frontend/src/stores/server/authoring.test.ts` now proves
the store consumes `direct_write`, `direct_write_dual_run`, and
`direct_write_authority` from the served status wire and floors sparse status to
the disabled legacy authority. The frontend status surface is no longer
backend-only or inferred from core envelopes.

### s225-increment2-demo-contract-fragmented | medium | no single backend test proves the autonomous demo data contract

The S225 backend verification pass found that the Increment 2 pieces are present
but the demo contract is only proven in fragments. `http.rs` sets the scope mode
from `/authoring/v1/mode`, `mode_after_submit` records the system approval and
calls the canonical `apply::apply_changeset` path, `projections.rs` serves the
applied-under-policy lane, `rollback.rs` generates rollback changesets, and
`modes.rs` requeues not-yet-applying system approvals with
`policy_version_changed`. Current tests cover those pieces separately:
`authoring::modes::tests::eligible_changeset_is_approved_by_system_actor_in_autonomous_mode`,
`authoring::modes::tests::applied_system_approval_is_served_in_the_after_fact_lane`,
`authoring::modes::tests::mode_downgrade_requeues_not_yet_applying_system_approval_as_human_review`,
`authoring::http::tests::operation_mode_policy_write_denies_agent_principal`,
`authoring::http::tests::submit_route_replays_after_auto_apply_advanced_the_head`,
`authoring::apply::tests::approved_changeset_materializes_once_and_records_an_applied_receipt`,
`authoring::rollback::tests::body_edit_rolls_back_by_restoring_the_source_preimage`,
and `tests/authoring_vertical_slices.rs::exit_gate_flow_issue_create_submit_approve_apply_rollback`.

No current route-level/backend data-contract test drives the actual Increment 2
demo path end to end: set scope to `autonomous`, submit a body edit, observe the
system approval and submit response `mode.auto_apply`, verify the changeset lands
through the canonical apply receipt, read the `applied_under_policy` lane with
rollback availability, generate the rollback, then downgrade mode and verify a
not-yet-applying system-approved item is requeued with served
`policy_version_changed`. The existing HTTP replay test simulates the advanced
head by appending statuses after a manual submit, and the vertical slice proves
manual approve/apply/rollback rather than autonomous submit/apply. This leaves a
medium S225 closure gap because the claimed Increment 2 demo data contract is not
covered as one backend behavior.

Resolved in the S225 fix pass:
`authoring::http::tests::increment2_demo_contract_auto_applies_rolls_back_and_requeues_on_downgrade`
now drives the route/data-contract demo as one scenario. It sets autonomous mode,
submits a real body edit, observes system approval plus `mode.auto_apply`,
verifies the body materializes through the canonical apply receipt, reads the
applied-under-policy lane with rollback availability, generates the rollback,
then downgrades mode and verifies a not-yet-applying system-approved item is
requeued with served `policy_version_changed`. This test also exposed and fixed
an apply/core fence mismatch: authoring snapshots use body payload hashes for
review/diff state, while `vaultspec-core vault set-body` fences on the full-file
git blob hash. `apply.rs` now uses the full file blob hash only for the internal
core invocation fence while preserving body-level hashes in authoring receipts
and post-state verification.

### w11-p33-lifecycle-feed-accepts-unknown-v1-rows | medium | projector feed version gate does not validate lifecycle schema or vocabulary

The W11.P33.S164 review found that `events.rs` wraps newly built lifecycle
payloads with `authoring.lifecycle_event.v1`, but replay conversion accepts any
outbox row whose `schema_version` is `1`. `projector_feed_record` only calls
`validate_schema_version` before copying `event_kind`, `aggregate_kind`, and
`payload` into the projector feed. It does not verify that the event kind is one
of the lifecycle vocabulary strings, that the payload is the lifecycle wrapper,
or that the wrapper `event_kind` matches the row-level `event_kind`. Because the
outbox table is shared and older or unrelated v1 rows can exist, a projector
rebuild can treat a non-lifecycle row as authoritative lifecycle state instead
of rejecting it or excluding it. The current tests cover unsupported future
versions but do not cover an unknown same-version event name, raw v1 payload, or
mismatched wrapped event kind. This weakens the ADR guarantee that clients
recover product truth from stable, versioned durable lifecycle events rather
than from ad hoc outbox rows.

Resolved in the S164 fix pass: projector feed conversion now validates the
outbox row against the lifecycle aggregate vocabulary, lifecycle event
vocabulary, lifecycle payload schema wrapper, payload schema version, matching
row/wrapped event kind, and presence of payload data before serving the row as a
feed record. The event test suite now covers unknown same-version event names,
raw v1 payloads, mismatched wrapped event kinds, and future schema-version
rejection.

### w11-p33-apply-start-underpublished | medium | apply start transition is not durably emitted

The W11.P33.S164 review found that the apply preflight unit of work appends the
`Applying` ledger revision and reserves the in-flight idempotency attempt, but
does not append the corresponding `apply.started` lifecycle event to the
transactional outbox. The shared event vocabulary maps `ChangesetStatus::Applying`
to `apply.started`, and the accepted streaming-events/outbox ADR requires durable
lifecycle transitions to be represented by outbox rows committed with the state
change. Today only the completion unit of work appends an outbox row, for
`apply.recorded` or `apply.failed`. If the process crashes after preflight but
before completion, restart/replay can see the durable `Applying` state only by
querying product state, not by replaying lifecycle events; a client recovering
from outbox sequence would miss the apply-start transition until a later terminal
completion or reclaim occurs.

Resolved in the S164 fix pass: apply preflight now emits `apply.started` through
the shared lifecycle event builder in the same unit of work that reserves the
in-flight idempotency attempt and appends the `Applying` ledger revision. The
apply regression now asserts a successful apply leaves `apply.started` followed
by `apply.recorded` in the durable outbox.

### w11-p34-too-new-cursor-silent-empty | high | resolved stream cursors ahead of durable high-water now produce an explicit gap

The W11.P34.S169 review found that lifecycle replay only checked whether
`latest_outbox_seq - last_seq` exceeded the bounded replay cap. A client cursor
greater than the durable high-water mark therefore fell through to
`events_after(last_seq, cap)` and returned an empty stream. That left a corrupt
or hostile frontend cursor with no lifecycle event, no gap event, and no
`next_recovery_seq` to recover from.

Resolved in the S169 fix pass: `lifecycle_replay_events` now emits a
`cursor_ahead_of_high_water` gap when `last_seq > latest_outbox_seq`, carrying
the requested cursor, latest durable outbox sequence, and next recovery
sequence. The stream test suite now includes a regression for the ahead-of-high
water cursor case.

### w11-p34-stream-error-not-tiered | medium | resolved SSE setup errors now carry tiers

The W11.P34.S169 review found that `/v1/events` converted store failures into
SSE `error` frames containing only `error_kind` and `error`. The accepted
streaming/outbox ADR and S166 checklist require recovery and error surfaces to
carry the shared tier block, so a stream client could not apply the normal
degradation contract on this failure path.

Resolved in the S169 fix pass: `stream_error_event` now includes the same
backend-served `tiers` block used by the authoring envelope. A regression test
asserts the SSE error frame carries both `tiers` and the semantic tier entry.

### w11-p34-subscribe-command-classification | low | resolved event stream uses subscribe command classification

The W11.P34.S169 review found that `/v1/events` opened its read transaction with
`RecoverEventStream`, while the route fixture and command vocabulary distinguish
event subscription from snapshot recovery. This did not leak a core verb, but it
blurred the semantic command boundary used for auditing read commands.

Resolved in the S169 fix pass: `/v1/events` now opens the read transaction with
`SubscribeEvents`, while `/v1/recovery` continues to use `RecoverEventStream`.
The read transaction helper was also hardened with SQLite `query_only` so
read-only command transactions cannot accidentally commit repository writes.

### w11-p50-activity-read-unbounded | high | resolved activity projection now streams under an explicit scan cap

The W11.P50.S229 review found that `document_activity_bounded` served a capped
activity page but first called `latest_changeset_rows`, which materialized every
latest changeset row before filtering by document key. That meant the wire page
was bounded but the repository read was not bounded, violating the W11.P50
resource-bound requirement for activity reads.

Resolved in the S229 fix pass: the unit-of-work repository now exposes a
streaming `query_for_each` helper, and the activity projection uses it through
`for_each_latest_changeset_row_until`. Activity reads stop at `cap + 1`
matching items or the explicit `MAX_DOCUMENT_ACTIVITY_SCAN_ROWS` scan ceiling,
and report `truncated` when either the served item cap or scan ceiling prevents
exhaustive activity enumeration. Count rollups remain full-corpus fixed
aggregates and do not derive from the bounded proposal page.

### w11-p50-activity-route-surface | medium | accepted S230 must decide and verify the served activity surface

The W11.P50.S229 review found that per-document activity is currently exposed as
a backend repository projection, while mounted authoring routes and recovery
snapshots do not yet call `document_activity`. This is accepted as a remaining
S230 verification/surface decision rather than an S227/S228 implementation
failure: S227 targeted `projections.rs`, and S226 explicitly left the route or
recovery exposure decision to the implementation/verification checklist.

S230 must either wire a backend-served route or recovery surface for
per-document activity, with the shared tier envelope where applicable, or record
why W11.P50 intentionally stops at the repository projection for this increment.
The decision must not leave the frontend to infer per-document activity from
bounded proposal pages or transient stream events.

### w11-p51-frontend-stream-cursor | low | no open frontend stream cursor findings after singleton subscription fix

The W11.P51.S234 review checked the frontend authoring lifecycle stream cursor
against the W11.P51 grounding notes, the streaming-events/outbox ADR, and the
existing graph stream hardening patterns. The implementation consumes durable
`lifecycle` frames as invalidation-only signals, handles explicit `gap` frames
through recovery snapshot application, preserves `error` frame tiers, removes
proposal/detail polling intervals, and keeps proposal rows/backend eligibility
as served projections.

One review risk was found and fixed before this audit entry was recorded:
mounting the stream directly in `useReviewStationView` could have opened more
than one stream loop if multiple consumers called the view hook. The store now
uses a module-level, reference-counted lifecycle subscription, so multiple React
subscribers share one replay/reconnect loop. Focused typecheck and authoring
store tests passed after the fix.

### w12-p25-direct-session-outbox | high | resolved direct-write sessions now publish session.created

The W12.P25.S124 review found that direct editor-save composition created a
durable authoring session through the session repository but bypassed the normal
session command event path. That meant the session row existed as product state
without a matching lifecycle event for stream replay and recovery audit.

Resolved in the S124 fix pass: the direct-write path now uses the shared
`session.created` lifecycle event helper in the same unit of work that creates
the direct-write session. The direct-write regression now asserts that a real
direct save leaves exactly one session aggregate `session.created` outbox event.

### w12-p25-recovery-event-read-model | medium | accepted recovery.snapshot_served remains deferred by the read-only recovery contract

The S124 review confirmed that `recovery.snapshot_served` exists in the lifecycle
vocabulary but is not emitted from the current recovery route. This is accepted
for W12.P25 rather than patched in place because `/authoring/v1/recovery` is a
read-only `GET` path opened through `RecoverEventStream` and SQLite `query_only`.
Emitting an outbox event there would make a recovery read mutate state and would
break the read-only command classification hardened in W11.

This remains an explicit follow-up for a future telemetry or audit command if
product requirements need durable recovery-read observations. It is not used as
product-state truth for sessions, runs, proposals, or approvals.

### w12-p25-prompt-turn-retention | medium | resolved sessions turns and runs declare retention records

The S124 review found that prompt text is bounded per row but initially had no
retention registration. That left generated prompt history with no compaction
class even though the authoring state-store ADR requires explicit retention
controls for large generated artifacts.

Resolved in the S124 fix pass: session, prompt-turn, and run writes now register
retention records. Sessions and runs are protected product state; prompt turns
are generation transcript records with payload sizing and a compaction marker.

### w12-p25-cancel-event-dedupe | medium | resolved repeat cancellation no longer republishes lifecycle transition

The S124 local review found that cancelling an already-terminal run with a new
idempotency key could replay the terminal value but still append another
`cancellation.recorded` lifecycle event. The session repository now reports
whether cancellation changed durable state, and the command handler only emits
the cancellation event on the state-changing transition.

### w12-p25-session-list-cursor | medium | resolved session listing cursor includes timestamp and identity

The S124 local review found that bounded session listing used only the
`updated_at_ms` cursor, which could skip or repeat rows when multiple sessions
shared a timestamp. The listing cursor now carries both the timestamp and
`session_id`, and the listing test creates same-timestamp sessions to prove the
next page has no overlap.

### w12-p25-recovery-error-taxonomy | low | resolved missing session or run recovery is no longer reported as store outage

The S124 local review found that a missing or mismatched session/run recovery
filter could surface as an authoring store failure. Recovery now maps session
domain refusal to the session-refused error kind, preserving the distinction
between bad recovery references and storage unavailability.

### w12-p30-caller-supplied-langgraph-refs | high | resolved public session commands no longer accept LangGraph refs

The S149 LangGraph runtime mapping review found that `CreateSessionRequest` and
`StartPromptTurnRequest` still exposed `langgraph` on the public command wire.
That let callers fabricate runtime refs and persist them through normal session
creation or prompt-turn start, bypassing the adapter-owned runtime mapping path.

Resolved in the S149 fix pass: public create/start request DTOs no longer carry
`langgraph`, request fixtures no longer include runtime refs, and the API
unknown-field regression now proves a caller-supplied `langgraph` payload is
rejected at the command boundary. Durable session, turn, and run records still
carry `LangGraphRef`, but only adapter-owned mapping paths attach it.

### w12-p30-session-run-ref-authority | medium | resolved session refs stay thread-scoped during run mapping

The S149 review found that mapping a runtime run also merged the run id and
checkpoint id onto the session-level `LangGraphRef`. That made the first
runtime run authoritative for the whole session and would reject later runtime
runs that share the same thread but have different LangGraph run ids.

Resolved in the S149 fix pass: run mapping stores runtime run and checkpoint
refs on the run and prompt turn, while the session-level ref is merged as
thread-only state. The recovery regression now asserts the recovered session
does not carry a runtime run id after a run/checkpoint mapping.

### w12-p30-runtime-ref-conflict-taxonomy | medium | resolved deterministic mapping conflicts are invalid references

The S149 review found that deterministic runtime reference conflicts were mapped
as `RuntimeFailed`, even though `InvalidReference` existed. That blurred a
domain conflict with infrastructure/runtime faults and contradicted the
denials-as-values taxonomy used by the authoring API.

Resolved in the S149 fix pass: LangGraph store mapping now converts deterministic
`LangGraph ...` session-domain conflicts into `InvalidReference`, while
non-domain store failures still surface as runtime mapping failures. The
conflict regression now expects `InvalidReference` and still verifies the stored
product state is not overwritten.

### w12-p30-diagnostic-redaction-token-local | low | resolved separated bearer and prompt fragments are redacted

The S149 review found that diagnostic redaction was token-local: markers such as
`Bearer` and `prompt:` could be redacted while the following credential or
prompt fragment survived in the private diagnostic. Public messages were already
safe, but the internal diagnostic policy was narrower than the S146 checklist.

Resolved in the S149 fix pass: diagnostic redaction now redacts the token after
separated `Authorization`, `Bearer`, `prompt:`, and `body:` markers. The focused
runtime failure regression covers a separated bearer token and prompt fragment.

## Recommendations

Proceed past W11.P34.S169 after the review-fix tests remain green. Keep the
reviewer-role boundary visible for the later approval-decision wiring: a
human-required policy requirement must be enforced as human eligibility when the
policy layer becomes the decision authority. Keep the direct-write capability
file as transition state until the planned Increment 6 broker-retirement gate
removes the legacy dual-run path. Keep full generation/token channel replay and
transcript compaction deferred to W12.P44; W11.P34 should continue to treat
generation placeholders as non-authoritative.

For W11.P50, proceed to S230 only after the bounded activity read fix remains
green under focused and package-level tests. In S230, verify the count block is
served through the proposal-list/recovery projection, and explicitly resolve the
per-document activity surface: route it, recover it, or document the repository
projection as the bounded backend surface for this increment.

For W11.P51, proceed to S235 with the accepted finite-replay constraint visible:
the frontend currently reopens `/authoring/v1/events` from the durable cursor
after clean completion because the backend endpoint serves bounded replay rather
than holding a long-lived live response.

For W12.P25, proceed to S125 after the S124 fixes remain green under focused
session/direct-write tests, the broader authoring test slice, and clippy.
Keep `recovery.snapshot_served` visible as an accepted read-model follow-up:
do not make the recovery `GET` mutate outbox state unless a later ADR or plan
step introduces a separate audit/telemetry command for recovery reads.

For W12.P30, proceed to S150 after the S149 fix pass remains green under focused
LangGraph tests, the public API unknown-field regression, the broader authoring
test slice, and clippy. Keep the next fixture/tool phases honest about the
boundary established here: runtime refs are adapter-owned correlation data, not
client-authored command input or product-state authority.
