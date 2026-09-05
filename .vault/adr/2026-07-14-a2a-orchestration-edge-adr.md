---
tags:
  - '#adr'
  - '#a2a-orchestration-edge'
date: '2026-07-14'
modified: '2026-09-05'
body_hash: 'sha256:8f69732829066e88c4870b7e140c30857607a8d67d8c96b45f604698ef87d0dd'
related:
  - '[[2026-07-14-a2a-orchestration-edge-research]]'
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
  - '[[2026-07-11-agentic-spec-authoring-backend-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-14-dashboard-rag-manager-adr]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
  - '[[2026-09-05-a2a-integration-verification-embedded-runtime-coordinated-contract-reference]]'
---

# `a2a-orchestration-edge` adr: `the stable cross-repo surface between the dashboard engine and the revived A2A orchestrator` | (**status:** `accepted`)

## Problem Statement

The dashboard ships the complete agent-facing document-authoring plane
(`/authoring/v1/*`: propose → submit → approve → apply, actor-token identity,
self-approval ban, served agent-tool catalog, durable replayable events) and a
finished multi-lane review frontend — but nothing that RUNS the
Research → ADR → Plan → Exec → Audit pipeline as an agentic workflow. The
sibling `vaultspec-a2a` repository is a substantial, currently-dependent
LangGraph orchestration backend whose team presets already encode those
pipeline roles, but whose agents write `.vault/` documents directly through
CLI file tools — the exact behavior the engine denies as `forbidden_actor`.
This ADR freezes the dashboard-side surface A2A builds against and the
mandates the A2A revival must satisfy. The dashboard drives requirements; A2A
conforms. The grounding research found the accepted agentic ADR cluster
pre-decided the architecture (agent adapter, LangGraph-is-execution-state,
state ownership, provenance); this record codifies the cross-repo edge and
decides the eight questions the cluster left open.

## Considerations

- The engine's document plane already exists and is test-enforced; the
  research route inventory confirms sessions/turns, proposal lifecycle,
  review/apply, run resume/cancel, interrupts, the agent-tool plane
  (catalog/prepare/execute/permission-decision), actor tokens, leases, and
  durable events. No new engine work is needed there.
- The frontend stores layer is the sole wire client and talks only to the
  engine; sibling operations transit only as transparent, whitelisted,
  namespaced pass-throughs (engine ADR D7.5). The rag sibling contract
  (manager + service-management ADRs) supplies the full control-plane
  template: fixed verb whitelist, boundary-validated bounded args, sibling
  envelope verbatim inside the tiers envelope, 502-with-tier-block when down,
  attach-never-own lifecycle over a machine-global discovery predicate.
- A2A's reusable core (graph compiler with star/pipeline/pipeline-loop
  topologies, role→phase presets, persistent task queue, ACP provider stack,
  thread/context packages, checkpointed durable state) is real and current
  (langgraph 1.1.6, langchain-core 1.2.28); its React UI and Google-A2A
  protocol stub are dead weight now that this dashboard is the frontend.
- Section-scoped proposal operations stay deferred (2026-07-11 deferral ADR);
  the edge may assume whole-document operation shapes only.
- The multiagent-composition ADR is `proposed`, demoted pending "two real
  agents whose work must compose" — which A2A team mode produces.

## Considered options

- **Revive A2A as a conforming sibling service behind an engine pass-through
  (CHOSEN).** Reuses ~53k lines of maintained orchestration; all conformance
  work lands on the Python side plus one bounded Rust proxy; matches the
  boundary ADR's anticipated sibling shape.
- **Rebuild orchestration inside the dashboard engine.** Rejected: LangGraph
  is a Python runtime; the engine is read-and-infer plus the fenced authoring
  domain; re-creating the orchestrator violates the sibling shape and wastes
  a tested core.
- **Fresh thin Python orchestrator cherry-picking A2A code.** Held as
  fallback only if A2A's operational surface proves too heavy; discards
  maintained tests and presets, so not preferred while the core lifts
  cleanly.
- **Let the dashboard frontend call A2A's gateway directly.** Rejected
  outright: breaks the sole-wire-client boundary and the single-origin
  contract; A2A would need its own auth/tiers/degradation story the engine
  already owns.

## Constraints

- Parent surfaces are stable: the authoring plane is shipped, reviewed, and
  guard-tested; the rag pass-through/lifecycle pattern is shipped in two
  generations (manager, service-management). Frontier risk sits in A2A's
  dependencies (LangGraph 1.x, ACP), which the streaming-outbox ADR already
  fences via versioned event schemas and adapter normalization.
- The engine never mutates `.vault/` or git (read-and-infer); A2A never
  reaches the vault by any path other than the authoring API. `vaultspec-core`
  stays hidden behind the engine's internal materialization adapter.
- Every engine→A2A call carries an output cap and wall-clock timeout;
  degradation is read from tiers, never inferred from transport errors.
- Actor identity resolves only from the server-held principal seam; tokens
  are minted by the engine and never by A2A.

## Implementation

**D1 — Control plane: one namespaced pass-through, `/ops/a2a/{verb}`.** The
engine forwards a fixed whitelist to the A2A gateway and nothing else:
`run-start` (preset id + prompt/message + target feature tag), `run-status`,
`run-cancel`, `presets-list`, `service-state` (health/doctor rollup). Args are
validated at the engine boundary (bounded enums, capped strings); responses
return the A2A envelope verbatim inside the shared tiers envelope;
sibling-down is a 502-with-tier-block. No mutating vault semantics ride this
namespace — it is orchestration control only.

> **Amendment (2026-07-19, active-run reload discovery):** D1 adds one bounded
> read verb, `active-runs`, as a reviewed cross-repository contract event. The
> engine maps it to sibling `GET /v1/runs?state=active`, always injects the
> active `ScopeCell.root` as `workspace_root`, accepts only the already-bounded
> optional `feature_tag`, and fixes the upstream result limit at two. The
> browser echoes `expected_scope` as a generation fence for both `run-start`
> and `active-runs`; the engine compares it with that same `ScopeCell` and
> returns 409 on a concurrent scope change, but never forwards the echoed path
> as authority. At `run-start`, the engine also persists its controlled root in
> A2A `metadata.workspace_root`, which is the durable selector discovery reads.
> sibling response remains verbatim and minimal: `run_id`, `status`, optional
> `feature_tag`, and `truncated`; no prompt, actor, session, or arbitrary path is
> disclosed. Discovery is non-authoritative under D3: the dashboard may restore
> a viewing binding only when exactly one valid result is returned and
> `truncated` is false, then it re-reads `run-status` and resumes the existing
> relay. Zero results leave the binding empty; two results or any truncation are
> deliberately ambiguous and never selected client-side. Actor filtering stays
> deferred until A2A persists a stable non-secret actor identifier. This changes
> no D5 ownership: reload may lose or restore only the dashboard binding; the
> durable run remains A2A-owned throughout. The frontend fails closed on any
> version, state, completeness, tier, refusal, row-shape, or result-bound drift;
> accepts only the six reviewed non-terminal `ThreadStatus` values; requires
> boolean verdicts for every canonical tier and for the optional `agent` tier
> when present; refreshes discovery whenever recovery is reactivated; clears
> any binding whose scope provenance is absent or different; and compares the
> generation fence using the same canonical scope token served to the browser;
> consumes a successful discovery snapshot after binding; and gates every
> transcript/relay render synchronously on binding scope equality.

> **Amendment (2026-07-17, shipped-surface ruling, review-adjudicated):** three
> interpretations recorded at implementation, each PASS-reviewed:
> (1) **Sibling-down semantics.** This decision's raw "502-with-tier-block"
> wording is read through its own reuse-the-rag-patterns rationale: the shipped
> rag ops template returns **200 with a degraded tier** for a KNOWN-DOWN
> sibling and reserves 502/504 for subprocess/proxy crash or timeout. The
> `/ops/a2a/*` namespace ships with those template semantics; degradation is
> read from tiers, never inferred from transport (wire-contract rule).
> (2) **D3 transport shape.** The relayed progress channel ships as a
> DEDICATED per-run SSE endpoint `GET /ops/a2a/runs/{run_id}/stream` rather
> than a channel on the multiplexed scope `/stream` the `backends` precedent
> literally names: run streams are per-run and upstream-sourced, and
> multiplexing them onto the scope stream would broadcast every concurrent
> run's frames to every scope subscriber. The endpoint reuses the shared
> seq/since/gap replay mechanics, so the "identical channel semantics"
> requirement holds; only the mount point differs.
> (3) **Degradation tier.** a2a outages degrade a dedicated `agent` tier
> (never `semantic` — an a2a outage must not misreport search), served
> only-when-degraded today exactly like the shipped `structural` precedent.
> Seeding `agent` as an always-present canonical tier in the engine-query
> envelope is a FUTURE reviewed wire-contract event, deliberately not bundled
> into this shipping. Shipped surface: `routes/ops/a2a.rs` +
> `routes/ops/a2a_stream.rs` at `fd7069cb01` (bounds: 64-relay registry cap,
> 90s idle read, 512KiB frame cap, 6h stream lifetime; token values verified
> absent from all logging). The full shipped edge surface additionally
> comprises the feedback-batch create/read routes plus the `feedback_batch_id`
> turn field (`d5bfbac932`, structurally-forgery-proof: the request type
> carries no token fields a client could supply) and the adopted
> run-completion slice `POST /authoring/v1/runs/{run_id}/complete`
> (`19d845c499`, extended `1653b4b85d`) — matching the cross-session
> reconciliation audit's P05 amendment spec
> (`2026-07-17-a2a-orchestration-edge-audit`).

> **Amendment (2026-08-01, clarification contract — reviewed cross-repo
> contract event, agent-panel campaign):** the whitelist grows to SEVEN
> verbs with `clarification-respond`, the typed resume of a run parked on
> a2a's mid-run clarification interrupt (`2026-08-01-a2a-agent-flow-adr`
> D5). Boundary at the engine: run id and request id path-safe (request id
> ≤64, pinned to the sibling's LITERAL bound rather than derived from an
> engine constant); answers map 1..=4 entries keyed by ≤64-char token
> question ids; values ≤4096, single-line (control characters rejected —
> the questionnaire renders an input, not a textarea). Upstream:
> `POST /v1/runs/{run_id}/clarifications/{request_id}/respond`, body
> `{"answers": {question_id: answer}}`, extra-forbidden. The engine judges
> no answer content: option existence, per-question satisfaction, and
> required-question completeness are the parked node's authority,
> validated a2a-side against the live checkpoint before any dispatch.
> Disclosure is authoritative on `run-status` (`pending_clarification`,
> projected from the checkpoint, proven to survive a genuine
> second-instance reload) and rides the verbatim envelope with no engine
> change; the relay gains ONE non-authoritative frame kind,
> `clarification-pending`, carrying the request id only — a nudge to
> re-read `run-status`, never the questions (D3 discipline). The relay
> itself is UNCHANGED code: frame kinds were already opaque passthrough,
> and the addition is pinned by conformance tests, not a relay
> modification. A sibling 404 forwards verbatim (unknown run, or an
> expired/superseded request id); a known-down sibling degrades the
> `agent` tier at 200 per the shipped template semantics. Shipped
> surface: engine `427aaddb9c` + reconciliation `9aa5648c95`
> (`routes/ops/a2a.rs` + new `routes/ops/a2a/clarification.rs`); a2a
> `f04425e9` on `feature/agent-flow` (node, checkpoint-projected
> disclosure, respond service, SSE catalog entry), whose own v1-route
> closed-set guard is the sibling-side amendment-forcing mechanism.
> Additionally recorded as a served-shape FACT, not a new verb:
> `presets-list` has always served full per-profile summaries (id,
> default flag, eligibility with reasons, per-role provider assignments);
> the composer's model picker consumes that existing truth per
> `2026-08-01-a2a-agent-flow-adr` D3 — no wire change was needed or made
> for model selection.

> **Amendment (2026-08-02, clarification resolution widens to three
> outcomes — reviewed cross-repo contract event, a2a-orchestration-edge
> campaign):** NO new verb. The brokered `clarification-respond` body
> widens to EXACTLY ONE OF three alternatives, enforced at the engine
> BEFORE any round-trip: `answers` (unchanged), `prompt` (the sibling's
> 2026-08-02 `clarification-continuation` outcome — a new prompt resuming
> the parked run; broker carry-through landed engine-side `184caa8323`),
> and `decline` (the sibling's 2026-08-02 `clarification-decline` outcome
> — a payload-free refusal that resumes the run with NO answer given,
> distinct from `run-cancel`; the sibling's gate appends one fixed marker
> turn as its downstream trace, producer landed a2a-side `e5ff51bb`).
> `decline` admits only the literal `true`, mirroring the sibling schema's
> refusal of the contradictory `false`. The sibling additionally renders
> an ANSWERED questionnaire into one human transcript turn
> (`clarification-decline` / `clarification-answers-grounding` records,
> a2a vault) — a sibling-side behaviour change with no engine wire
> impact, noted here so the transcript a viewer reads is not mistaken for
> client-fabricated content. Producer-first ordering was honoured for
> decline; the continuation carry-through corrected the inverse gap
> (sibling served an outcome the broker could not reach). Stores seam:
> `useRespondToClarification` takes the exactly-one-of union
> (`answers | prompt | decline`), making an ambiguous two-outcome
> submission unrepresentable in the client. Bound correction folded into
> this event: the continuation `prompt` takes the RUN-MESSAGE posture
> (trim-non-empty, the run-start 64 KiB ceiling, multiline legal), not
> the answer posture (single-line, answer-sized) it first shipped with —
> the sibling types `ContinuationPrompt` against its run-message ceiling
> with no line-safety rule, so the answer posture refused prompts the
> sibling accepts and stranded the user on a parked run.

> **Amendment (2026-08-02, run-start selection becomes
> optional-until-served — owner-directed ruling, relayed by the review
> router):** the brokered `run-start` had come to REQUIRE an A2A-served
> catalog `selection` while the sibling's extra-forbid `RunStartRequest`
> admits no such field and `/v1/provider-catalog` (whitelisted, engine
> `12f7de9796`) is not yet served — so no run could start through an
> engine built from current main in either direction (evidence:
> `2026-08-02-a2a-orchestration-edge-provider-catalog-inversion-audit`).
> This relaxation is the RESTORATION of producer-first, not a tolerated
> violation of it: the rule exists so a consumer never demands what no
> producer serves, and the mandatory selection was the engine enforcing a
> future contract against the present sibling. The relaxed contract:
> `selection` is OPTIONAL on brokered run-start; when absent, the
> forwarded body carries no selection-shaped key at all (never a null,
> never an empty object) — the only body the deployed sibling accepts;
> when present, it is validated exactly as before and forwarded, so the
> catalog consumer stack stays intact for the moment its producer lands.
> Orphan `overrides`/`fallbacks` without a `selection` are refused: they
> modify a whole-team selection that is not there. Landing with the fix,
> not after it, is the conformance pin
> (`run_start_forwards_only_keys_the_sibling_schema_admits`): every
> forwarded run-start key must be in the sibling's pinned
> `RunStartRequest` field list, with the selection keys deliberately
> absent until served — extending that list is a reviewed
> cross-repository contract event, never a local edit. **SUNSET:**
> `selection` becomes mandatory again in ONE reviewed event when the
> sibling BOTH serves the catalog read AND admits the selection fields on
> run-start (the provider-model-catalog record's producer milestones,
> a2a vault); the reversal re-tightens `validate.rs` and moves the three
> selection keys into the pinned admitted list together.

> **Amendment (2026-09-05, embedded control completion — reviewed
> cross-repository contract event):** D1 grows from seven to exactly ELEVEN
> verbs. The four additions are `run-message`, `permission-respond`,
> `native-commands-list`, and `native-command-execute`. They are fixed
> orchestration controls, never an arbitrary route, shell, provider RPC, or
> untyped prompt escape. This event is the authority for S43-S45; the
> coordinated embedded-runtime reference is its implementation table.
>
> Every browser request is authenticated by the Dashboard machine bearer and
> contains `expected_scope` (1..4096 characters), which the engine compares to
> its current `ScopeCell` before inserting that same canonical workspace root.
> The scope value is never forwarded as authority. The engine accepts no attach
> token, lifecycle capability, actor token, endpoint, filesystem path, or
> provider credential from the browser. It resolves the receipt-joined product
> gateway and supplies the server-held attach bearer. `run_id` uses
> `[A-Za-z0-9_][A-Za-z0-9_-]{0,127}`. `request_id`, `command_id`, and
> `idempotency_key` are 1..128 characters from `[A-Za-z0-9_.:-]`; command ids
> are percent-encoded as one path segment. Request bodies reject unknown fields.
>
> `run-message` maps to `POST /v1/runs/{run_id}/messages`, uses the 60-second
> control budget, and forwards body `{"content": string, "agent_id"?: string}`
> plus `Idempotency-Key`. `content` is nonblank after trimming, at most 65,536
> Unicode scalar values and 262,144 UTF-8 bytes. Optional `agent_id` uses the
> run-id grammar and must name the authoritative `run-status` roster; omission
> selects the supervisor. The browser body is exactly `{expected_scope, run_id,
> content, agent_id?, idempotency_key}`. Success is HTTP 202 with
> `{api_version:"v1",run_id,accepted:true,applied:boolean,action_status,
> action_id,idempotency_key}`; `action_id` and `idempotency_key` are non-null on
> acceptance. The action status is one of `accepted_not_applied`, `applied`, or
> `duplicate`. That tuple is the durable receipt; acceptance never claims turn
> completion.
>
> `permission-respond` maps to
> `POST /v1/runs/{run_id}/permissions/{request_id}/respond`, uses 60 seconds,
> and forwards `{"option_id": string, "notes"?: string}` plus
> `Idempotency-Key`. `option_id` is 1..64 characters; `notes` is at most 2,048
> characters and 8,192 UTF-8 bytes. The browser body is exactly
> `{expected_scope,run_id,request_id,option_id,notes?,idempotency_key}`. Before
> dispatch, Dashboard re-reads `run-status` and requires the request under that
> run and the exact advertised option; A2A repeats that check atomically.
> Success is HTTP 200 with `{api_version:"v1",run_id,request_id,accepted,
> applied,action_status,approval_status?,action_id,idempotency_key}`. Accepted
> statuses are `accepted_not_applied`, `applied`, or `duplicate`; a rejected
> journal receipt uses `rejected_invalid_state`. The receipt retains run,
> request, option-bound idempotency, action, and application state.
>
> `native-commands-list` maps to
> `GET /v1/runs/{run_id}/native-commands`, uses the 45-second discovery budget,
> and accepts only `{expected_scope,run_id}`. Success is HTTP 200 with
> `{api_version:"v1",run_id,session_revision,busy,commands}`. `session_revision`
> is a 1..128 character opaque token. `commands` has at most 32 items, each
> exactly `{command_id,title,description?,disposition,argument}`: command id
> obeys the command-id grammar, title is 1..128 characters, description is at
> most 512, disposition is `supported`, `blocked`, or `unsupported`, and
> argument is `{kind:"none"}` or `{kind:"text",required,max_chars,multiline}`
> with `max_chars` in 1..4096. The list is session-scoped truth; an empty list is
> valid, and Dashboard does not infer support from provider name.
>
> `native-command-execute` maps to
> `POST /v1/runs/{run_id}/native-commands/{command_id}/execute`, uses 60 seconds,
> and forwards `{"session_revision": string, "arguments"?: string}` plus
> `Idempotency-Key`. The browser body is exactly `{expected_scope,run_id,
> command_id,session_revision,arguments?,idempotency_key}`. Arguments must match
> the advertised argument descriptor, are at most 4,096 characters and 16,384
> UTF-8 bytes, and never become argv or shell text at the engine. Success is
> HTTP 200 or 202 with `{api_version:"v1",run_id,command_id,session_revision,
> accepted,applied,action_status,action_id,idempotency_key,effect}`. Status is
> one of `accepted_not_applied`, `applied`, or `duplicate`; `effect` is exactly
> `{kind:"ordinary"|"compact",status:"pending"|"completed"|"failed",
> before_context_tokens?: nonnegative integer,after_context_tokens?:
> nonnegative integer}`. A compact command is reported completed only after an
> independently observed context reduction; echoing command text is not an
> effect.
>
> Retry and reconciliation are fixed for all eleven verbs. `presets-list`,
> `provider-catalog`, `active-runs`, `run-status`, and `native-commands-list`
> receive no automatic retry; a caller may issue a new independently bounded
> read. `run-start` permits exactly one retry only after an ambiguous connection
> or protocol failure, using the identical run id, reservation id, and complete
> payload; Dashboard then reads authoritative `run-status`, retains the token
> lease when the result remains unknown, and never starts a second identity.
> `run-cancel` receives no blind retry; after ambiguity Dashboard reconciles
> authoritative `run-status`, and only a later explicit caller action can issue
> another cancel. `clarification-respond` receives no blind retry, preserves the
> exact run id, request id, and resolution, and reconciles the authoritative
> run-status/checkpoint result before permitting another caller action.
> `run-message`, `permission-respond`, and `native-command-execute` use the
> mandatory idempotency replay rule below.
> For `run-message`, `permission-respond`, and `native-command-execute`, the
> idempotency key is mandatory and stable for one
> user intent. A2A durably binds it to the complete normalized payload before
> dispatch. Reuse with the same payload replays the same receipt; reuse with a
> different payload is `idempotency_conflict`. Dashboard performs no blind
> retry. After an ambiguous connect, protocol, or timeout failure it may make
> exactly one reconciliation replay with the same identity, key, and payload.
> A returned receipt is authoritative; a second ambiguous failure returns a
> typed `outcome_unknown` proxy error and preserves the identity for a later
> retry. Reads may be reissued as new bounded reads.
>
> Every A2A refusal or error is JSON
> `{api_version:"v1",error:{code,message,retryable},identity:{run_id,
> request_id?,command_id?,idempotency_key?},receipt?}` with `message` capped at
> 512 characters. A2A codes are exactly `not_found`, `request_conflict`,
> `option_conflict`, `idempotency_conflict`, `busy`, `blocked`, `unsupported`,
> `invalid_arguments`, `invalid_state`, `at_capacity`, `provider_unavailable`,
> or `internal_failure`. Schema and bound failures are 400/422; missing
> identities 404; stale session, superseded request, busy, and idempotency
> conflicts 409; capacity/breaker 503. Dashboard forwards every sibling success
> or refusal at HTTP 200 under `data.envelope`, adds `data.sibling_status` for
> non-2xx, and always supplies tiers. Dashboard-originated failures use its
> normal typed API-error envelope with `error.code`: preflight scope drift is
> `scope_conflict` at 409; a second ambiguous mutation result is
> `outcome_unknown` at 502; timeout is `gateway_timeout` at 504; connect/crash
> is `gateway_unavailable` at 502; malformed protocol is `protocol_error` at
> 502. Known-down remains HTTP 200 with a degraded `agent` tier. Browser-bound
> output remains under the existing 8 MiB cap. Any new verb, field meaning,
> enum member, route, or bound is another reviewed cross-repository contract
> event.
**D2 — Actors and tokens are provisioned by the engine at run start.** The
brokered `run-start` verb is the provisioning moment: the engine registers (or
re-resolves) one agent actor per pipeline role in the run (researcher,
analyst, planner, executor, reviewer — plus the supervisor as a distinct
actor), issues per-actor tokens via the actor-token surface, and passes them
to A2A inside the forwarded start payload. A2A holds tokens only for the life
of the run and never mints, renames, or shares them across roles. Provenance
is thereby rooted before the first agent turn, and the self-approval ban
(keyed on changeset origin) binds per-role.

**D3 — Progress streaming splits by authority.** Durable document-lifecycle
truth (proposal created/submitted, approval opened/decided, apply results,
conflicts) is already emitted on the authoring events surface with sequence
replay — the frontend consumes it exactly as it does today, with no A2A
awareness. Orchestration progress (node transitions, agent turns, token
streams) stays A2A-side and reaches the frontend as a relayed engine SSE
channel (the `backends` channel precedent) carrying bounded, versioned,
non-authoritative frames; a client recovering truth re-reads `run-status` and
the durable events, never the relay. If the relay proves noisy, degrading to
bounded polling of `run-status` is contract-conformant.

> **Amendment (2026-07-17, three-verdict activation — `request_changes` is live
> end-to-end):** the approval authority is the engine by ratified contract (no
> second approval authority in A2A): A2A proposes into `/authoring/v1/proposals`,
> the human decides in the dashboard, and A2A resumes on the SSE-delivered
> verdict. That verdict vocabulary is now COMPLETE. `request_changes` — the
> reviewer-driven return to draft that A2A's `phase_gate` loops back into a
> revision cycle — is activated (W13.P24) alongside the already-live `approve`
> and `reject`, closing the gap where the engine modeled but rejected the verb.
> The decision:
>
> - **Wire shape.** `request_changes` flows through the SAME decisions route as
>   approve/reject (`POST /authoring/v1/reviews/{approval_id}/decisions`, wire
>   verdict `edit`) and the SAME `submit_decision` engine path. It drives the
>   kind-aware `EditProposal` arc (`NeedsReview|Approved → Draft` /
>   `RollbackProposed`) under the reviewer's identity — a reviewer edit — which
>   stales the prior approval. Having no changeset status of its own, it is
>   published on the durable outbox as `approval.resolved` carrying the
>   authoritative `decision: "request_changes"` field (with the reviewer's
>   comment), so A2A's verdict subscriber decodes the verdict from the field with
>   the same envelope discipline as approve/reject.
> - **Invariants preserved.** The self-approval ban (keyed on `origin_author`)
>   is DELIBERATELY not applied to `request_changes`: requesting changes is
>   feedback, not an approval, and a proposer requesting changes on their own
>   proposal is legitimate — the arc is gated only by the transition itself
>   (a terminal or non-reviewable head is refused as a denied value). Freshness /
>   stale-review 409 semantics and append-only decision records are unchanged.
>   `request_changes` is deliberately legal on a stale or unvalidated review —
>   that is precisely why it is being sent back.
> - **Served, never client-invented.** The review-station projection now
>   advertises `edit_proposal` in the served eligibility for a `NeedsReview`
>   proposal through the SAME predicate the decision path consults
>   (`edit_proposal_transition_eligibility`), so what the queue offers can never
>   drift from what `submit_decision` accepts (review-actions-are-backend-served).
>   The ReviewStation surfaces it as a third action carrying a REQUIRED comment
>   (the requested changes).
> - **Scope fence.** This amendment covers `request_changes` only. `Respond`
>   remains a status-preserving review-station clarification exchange, not a
>   decision verdict; no verdict-vocabulary change is implied for it here.
>
> This is recorded as an amendment rather than a silent capability change per the
> ratified-contract discipline: the three-verdict approval vocabulary is now the
> stable cross-repo edge A2A's phase gate builds against.

**D4 — Reads stay split: filesystem for corpus context, authoring API for
in-flight state.** A2A's read-only, token-budgeted `.vault/` mount layer is
retained for corpus context (compatible with engine read-and-infer; reads are
not writes). Anything about in-flight work — proposal snapshots, changeset
status, conflicts, review state — is read from the authoring API, never
reconstructed from the filesystem, which cannot see unapplied proposals.

**D5 — State-ownership fence.** A2A owns orchestration state only: threads,
runs, checkpoints, task-queue entries, its own database. The engine owns all
document state: changesets, proposals, approvals, preimages, receipts, audit.
A2A stores Vaultspec ids (proposal, changeset, approval) as references;
Vaultspec stores LangGraph ids (thread, run, checkpoint) as provenance.
Neither system duplicates the other's record; A2A must not grow a second
document ledger, and the engine must not persist runnable graph state.

**D6 — Documents come into existence only through the ledgered create path.**
A2A worker tools expose no filesystem write into any `.vault/`. New pipeline
documents (research, ADR, plan, exec, audit) are proposed as whole-document
creations through the authoring API, which scaffolds/validates via the
engine's internal core adapter — frontmatter, filenames, and templates are
never agent-authored. Whole-document operation shapes only, honoring the
standing section-operations deferral.

**D7 — A2A repo mandates (the dev-team brief derives from this decision).**
(a) Delete the React/Vite UI and every frontend ambition — the dashboard is
the product surface; A2A is headless, driven by its CLI and the engine
pass-through. (b) Replace agent file-write tools with authoring-API clients
per D2/D6. (c) Adopt the machine-global discovery contract (service file +
heartbeat + ungated health with live pid) so the engine's attach-never-own
lifecycle predicate applies verbatim. (d) The Google-A2A protocol stub is
removed; "a2a" survives as a project name only, with ACP + REST/SSE as the
declared transports. (e) The reusable core to preserve: graph compiler,
presets, task queue, providers, thread/context packages; the gateway/worker
split may be simplified but is not required to be. (f) Keep the engine
completely absent from A2A's dependency graph — the edge is HTTP only.

**D8 — Composition re-arm is a follow-on gate, not a prerequisite.** The
first two-agent A2A run whose proposals must compose is the named return
trigger of the proposed multiagent-composition ADR; when it fires, that
record returns to review for acceptance on real evidence. Nothing in this
edge builds against the composition projection while it remains proposed;
until then concurrent proposals ride the accepted concurrency/leases/conflict
semantics unchanged.

## Rationale

The grounding research shows both halves already exist: the engine's authoring
plane is the agent adapter the boundary ADR called for, and A2A is the
LangGraph runtime the cluster assumed would connect to it. The cheapest
correct system is therefore a contract, not a build: freeze the edge at HTTP,
reuse the rag sibling patterns for everything operational, and spend the new
effort where the research located the only real conformance gap — A2A's write
seam. Engine-side token provisioning at run start (D2) was chosen over
A2A-side registration because it keeps identity authority, audit rooting, and
the self-approval ban entirely inside the engine's principal seam. The
streaming split (D3) repeats the streaming-outbox ADR's durable-vs-ephemeral
division across the repo boundary rather than inventing a new channel class.

## Consequences

- The Research → ADR → Plan pipeline becomes runnable by agent teams with
  every document landing as a reviewable, ledgered proposal in the existing
  review lanes — no new review UI, no new document semantics.
- New engine surface is small and bounded: one pass-through namespace, one
  relayed SSE channel, run-start actor provisioning. Each is an established
  pattern with in-repo precedent.
- A2A's revival cost is concentrated and explicit: write-seam swap, discovery
  contract, UI deletion. Its team presets, topologies, and queue survive
  unchanged.
- Cross-repo debugging requires correlating Vaultspec ids with LangGraph ids;
  D5's mutual reference rule is what keeps that tractable and must be tested
  on both sides.
- Two repos now hold halves of one contract; the edge (verb whitelist, start
  payload, discovery predicate) must be documented once and mutually
  referenced, and any change to it is a reviewed contract event — never a
  refactor.
- Risk: the run-start payload carrying actor tokens makes that one verb
  security-sensitive; it must never be logged verbatim and its transport
  stays loopback HTTP under the engine's bearer, matching how the engine
  already handles actor tokens.

## Codification candidates

- **Rule slug:** `a2a-edge-is-http-only-and-engine-fronted`.
  **Rule:** The dashboard frontend reaches A2A only through the engine's
  whitelisted `/ops/a2a/*` pass-through, and A2A reaches the vault only
  through the engine's authoring API; neither repo imports the other, and
  every document mutation an A2A agent produces is a ledgered proposal under
  an engine-issued per-role actor token.
- **Rule slug:** `orchestration-state-and-document-state-never-merge`.
  **Rule:** A2A persists orchestration state (threads, runs, checkpoints,
  queue) and stores Vaultspec ids as references; the engine persists document
  state (changesets, approvals, preimages, audit) and stores LangGraph ids as
  provenance; neither system duplicates the other's record.
