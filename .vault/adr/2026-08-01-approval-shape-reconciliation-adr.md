---
tags:
  - '#adr'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:1ddf4838cad8c53a6920e2a3cb26dccbd0130c8d911c20eded6724c9a8df8758'
related:
  - '[[2026-08-01-approval-shape-reconciliation-cross-repo-inventory-reference]]'
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
---
# `approval-shape-reconciliation` adr: `one approval outcome, one enforced requirement, no second authority` | (**status:** `accepted`)

## Problem Statement

Two repositories model the same approval fact three ways, and the engine's
served approval policy names a guarantee it does not enforce. The full
inventory, with locators, is
`2026-08-01-approval-shape-reconciliation-cross-repo-inventory-reference`; this
record decides the reconciliation, restating nothing.

Six questions require a decision now:

1. What `HumanApprovalRequired` means, what it is named, and what the served
   `decision_reason` prose may claim.
2. Whether the dead review-authority branch of the composed authorization
   engine is deleted or wired.
3. Whether A2A's run-scoped permission respond route may answer a
   document-approval pause.
4. Whether the shared pause-cause constant that bundles the plan gate with the
   document gate splits.
5. Whether the modelled-but-unreachable `session_override` gains a wire surface
   or is stripped.
6. Which single shape carries an approval outcome across the legacy plan path,
   the document path, and the engine's decision record.

## Considerations

- The governing security rule (`2026-06-29-agentic-security-provenance-adr`,
  slug `agents-cannot-self-approve-vault-writes`) requires an authorized
  DISTINCT reviewer or an explicit recorded system auto-apply policy. It says
  distinct; it never says human.
- The operation-modes record (`2026-07-02-agentic-operation-modes-adr`) states
  the destructive floor as HUMAN, three separate times: destructive operations
  "require explicit human approval in EVERY mode; no mode may widen this";
  destructive operations "still queue for explicit human approval" even under
  `autonomous`; and its risk analysis bounds mode misconfiguration BY that
  human floor. This is a considered, repeated commitment, not loose prose.
- The edge contract (`2026-07-14-a2a-orchestration-edge-adr`) provisions an
  agent REVIEWER role per run by design (D2), and its 2026-07-17 amendment
  ratifies that "the approval authority is the engine by ratified contract (no
  second approval authority in A2A)" (D3).
- Verified enforcement today (locators in the grounding reference): the
  distinct-reviewer ban fires live at two domain seams —
  `authoring/approvals.rs:287` inside `review_decision_eligibility`, and
  `authoring/apply/mod.rs:278` — both delegating to the one
  `automated_self_approval_blocker` authority. The requirement
  `approval_requirement(mode, risk)` is consumed only by the system
  auto-approval gates (`authoring/policy.rs:216`, `authoring/modes.rs:250`).
  The human decision route reads NEITHER the mode NOR the risk class: no code
  path checks the approver's actor kind against a destructive changeset.
- The composed authorization engine (`authoring/security.rs`) IS wired in
  production — `run_authorization` runs at three HTTP seams — but all three
  pass `origin_author: None` (`http/handlers1.rs:750`, `http/handlers3.rs:706`,
  `http/mod.rs:299`), so only its review-authority clause is dead. Its own
  module doc concedes it "adds nothing those planes already own".
- A2A's respond transition constructs `{"approved": bool}`
  (`control/permission_service.py:606`) for every pause named in
  `PLAN_APPROVAL_PAUSE_CAUSES` (`thread/snapshots.py`), which bundles
  `document_approval_request` under a comment asserting both gates park with
  the same shape. The document gate parses `{"verdict", "notes"}`
  (`graph/nodes/phase_gate.py:97`), so a respond against a document pause
  records REJECTED whatever the caller answered — safe but dishonest, and a
  state fork against engine truth. The lawful document path is the verdict
  subscriber resuming with the verdict-and-notes shape.
- The legacy plan gate parses `{"approved": bool}`
  (`graph/nodes/supervisor.py:366`); the respond DTO carries no notes field.
- `session_override` is modelled on `ExecuteToolCallRequest`
  (`authoring/executor.rs:56`) and the permission input
  (`authoring/permissions.rs:190`), echoed on the served policy projection, and
  mirrored in frontend types — yet `ExecuteToolCallRequest` is `pub(crate)`
  with no `Deserialize`, and every production constructor hardcodes `None`.
  The narrowing-only law means a client-supplied override could not escalate,
  so building it would be safe; nothing needs it.
- Preserved property, not a gap: no production A2A code sets the engine's
  operation mode. The OPERATOR is the mode setter. An agent widening its own
  approval policy is the hazard the narrowing-only override and the
  system-actor requirement exist to prevent.

## Considered options

**On the requirement's meaning (D1):**

- *Enforce human-kind everywhere `HumanApprovalRequired` is computed.* Rejected:
  it would refuse the agent reviewer role the edge contract provisions by
  design, and the governing security rule demands distinct, not human.
- *Rename only; enforce nothing new.* Rejected in part: honest for the
  non-destructive manual case, but it silently RATIFIES an agent reviewer
  approving a destructive changeset — renaming the operation-modes record's
  thrice-stated human floor out of existence as a side effect of a naming fix.
  A two-agent writer/reviewer pipeline (exactly what D2 provisions) could then
  archive or roll back documents with zero human involvement.
- *Split the requirement: rename the manual case, enforce the destructive
  case.* CHOSEN — the only option under which every served value states an
  enforced truth.

**On the dead branch (D2):**

- *Leave it dead.* Refused outright — a dead copy of a security control invites
  designs written against code that never runs.
- *Wire it as the single enforcement point, retiring the two domain seams.*
  Rejected: `review_decision_eligibility` backs the review-station projection's
  served eligibility; hoisting enforcement to the HTTP layer would let what the
  queue advertises drift from what the decision path enforces, and would leave
  any future non-HTTP command path unguarded.
- *Delete the branch; the domain seams remain the enforcement.* CHOSEN.

**On the A2A respond route (D3):** teach it the verdict shape (rejected —
ratifies the second approval authority the amended edge contract forbids), or
refuse document pauses at that route. CHOSEN: refuse.

**On `session_override` (D5):** build the wire surface (rejected — safe but
consumerless; shipping a control nothing reads is a defect class this project
already refuses), or strip it. CHOSEN: strip.

**On the outcome shape (D6):** keep three shapes (rejected — the mismatch is
the live defect), collapse onto the approved-boolean shape (rejected — loses
the request-changes verdict and the reviewer notes the engine vocabulary
already carries), or collapse onto the verdict vocabulary. CHOSEN: verdict.

## Constraints

- The engine's `ApprovalRequirement` is serde-serialized onto the wire and
  mirrored by frontend types: renaming and splitting it is a wire contract
  event, reviewed here as the wire-contract rule requires. Client mapping is
  presentation-only, so the blast radius is the served token and its label.
- Reject and request-changes remain exempt from every approve-side gate:
  withdrawing or rejecting one's own proposal is deliberately legal, and the
  destructive-floor enforcement must not leak onto those arms.
- The A2A side must fail closed during any interim: the current broken respond
  path already records rejection, so refusing the route outright is a strict
  honesty improvement with no new hazard window.
- The product provisioning / lifecycle lane is ON HOLD by owner directive;
  nothing in this record touches lifecycle authorities, capsule-vs-onedir, or
  the lifecycle HTTP surface.

## Implementation

**D1 — the requirement splits into three honest variants, and the destructive
floor becomes enforced.** `ApprovalRequirement` becomes:

- `HumanApprovalRequired` — retained ONLY for destructive risk, and now
  ENFORCED at the decision seam: the approve arm of
  `review_decision_eligibility` (and the apply path's equivalent seam) refuses
  a decision-maker whose actor kind is not Human when the changeset's risk is
  destructive, as a denied eligibility value. The served projection and the
  enforcement derive from the same seam, so what is advertised cannot drift
  from what is enforced.
- `ReviewerApprovalRequired` — NEW, for non-destructive changesets under
  `manual` mode: a decision must be submitted by an authorized actor distinct
  from the proposer (the existing `automated_self_approval_blocker` law); the
  system may not auto-approve. This is the variant that makes the agent
  reviewer role honest.
- `SystemAutoApprovable` — unchanged.

The `decision_reason` prose is corrected in the same movement: the manual
non-destructive reason states that apply requires a decision by an authorized
reviewer distinct from the proposer; the destructive reason keeps its human
language, which this decision makes true. The frontend mirror adopts the new
token; no client-side re-derivation is introduced. The tool-permission plane's
separate `ToolPermissionRequirement::HumanApprovalRequired` is out of scope
here and is not renamed by this record.

**D2 — the dead review-authority branch is deleted.** The `origin_author`
field of `CommandAuthorization`, the review-authority clause of
`authorize_command`, `is_review_authority_command`, and the orphaned
`reviewer_eligibility` wrapper are removed. `automated_self_approval_blocker`
remains the single distinct-reviewer authority, enforced at its two live
domain seams. The security module's remaining three guards — actor standing,
delegation standing, document scope — are untouched and stay wired.

**D3 — A2A's respond route refuses document-approval pauses.** A respond
against a pause of type `document_approval_request` returns a typed error
naming the engine review surface as the deciding authority. The ONLY resume
path for a document gate is the verdict subscriber projecting the engine's
decision. This confirms, rather than re-litigates, the amended edge contract:
no second approval authority in A2A.

**D4 — the pause-cause constant splits by capability.**
`PLAN_APPROVAL_PAUSE_CAUSES` splits into a verdict-style-pause classification
(a projection and FSM concern — both gates legitimately classify there) and a
locally-respondable set that EXCLUDES `document_approval_request`. The false
comment asserting both gates park with the same shape is corrected.

**D5 — `session_override` is stripped.** The parameter leaves
`ExecuteToolCallRequest` and the permission input; the served
`session_override` and `session_override_ignored` projection fields and their
frontend mirrors are removed; the operation-modes record's session-layer
language is amended to state the layer is rescinded until a real consumer
exists. Reintroduction requires its own decision record AND an actual wire
client, and must preserve the narrowing-only law. No deprecation bridge is
kept.

**D6 — one outcome shape: the verdict vocabulary.** Every locally-parked A2A
gate parks and resumes on a verdict object — verdict of approved, rejected, or
request_changes, plus optional notes. The legacy plan gate's approved-boolean
parse and the respond transition's approved-boolean construction are retired
together — a full cutover, no bridge. The respond DTO gains an optional notes
field so a reviewer comment survives the resume. The engine's decision record
— a verdict bound to the reviewed tuple — is already the canonical shape and
does not change; document-gate verdicts continue to arrive solely via the
verdict subscriber, which already speaks this vocabulary.

**D7 — preserved property: the operator sets the mode.** A2A gains no path to
the engine's mode-setting surface; the absence of a production caller is
ratified as a contract property, not a gap. Any future request to let an
orchestrator influence effective mode is bounded by the narrowing-only law
and requires its own decision record.

## Rationale

The apparent dichotomy — enforce human and break the agent reviewer, or rename
and enforce nothing — dissolves once the two governing records are read
together at their actual altitude. The security rule governs WHO may decide
(distinct, authorized); the operation-modes record governs WHAT CLASS of
change may be decided without a human (non-destructive only, and only outside
manual). These compose cleanly: an agent reviewer deciding a non-destructive
document proposal satisfies both; an agent reviewer approving a destructive
rollback violates the second. The current two-variant enum cannot express that
composition, which is exactly why its name lies on the wire. Three variants
express it, and the destructive-floor enforcement lands at the seam that
already backs the served eligibility, so the projection stays truthful by
construction.

Deleting the dead branch rather than wiring it follows the module's own
admission that it duplicates the policy plane, plus the drift argument: two
live copies of one security check is how advertised eligibility and enforced
eligibility part ways.

Refusing document pauses at the A2A respond route is the amended edge
contract's plain reading; the alternative would stand up the second authority
that contract exists to forbid, and would do so at the exact site that today
silently rejects every answer.

The verdict vocabulary wins the shape question because it is the only one of
the three shapes carrying the full ratified decision set — approve, reject,
request_changes — plus reviewer notes, and it is the shape the engine already
records durably.

## Consequences

- Gains: every served approval token states an enforced truth; the destructive
  human floor moves from prose to code; the silent-reject defect dies at its
  root (the respond route can no longer reach the document gate with the wrong
  shape); one approval-outcome vocabulary spans both repositories; the dead
  security branch can no longer mislead a design.
- Behaviour change, deliberate: an agent reviewer who could yesterday approve
  a destructive changeset is refused after D1 lands. This is fail-closed and
  matches the ratified floor; an A2A run whose pipeline routes a destructive
  proposal to an agent reviewer will park until a human decides — the intended
  outcome, not a regression.
- Wire contract events, reviewed here: the requirement token split (a
  `reviewer_approval_required` token added, destructive-only semantics for the
  human token), removal of the served `session_override` fields, and the A2A
  respond DTO's optional notes field.
- Costs: cross-repo sequencing — the A2A respond refusal (D3) and constant
  split (D4) can land independently of the engine rename (D1), but the shape
  unification (D6) should land with or after D3 so no interim teaches the
  respond route the document shape. The operation-modes record needs a
  targeted amendment for D5's rescinded session layer.
- Open, explicitly NOT decided here: the Claude-family autonomous
  auto-approve-first-option fallback versus the Kimi family's exact-name
  allowlist (grounding reference, final open question) — its reachability for
  a mutating tool is unverified; it needs its own check of what the allowlist
  holds at call time before any decision is honest.
