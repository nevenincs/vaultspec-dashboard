---
tags:
  - '#plan'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_hash: 'sha256:8ef1debad849220aa65c60b7302e714d93341a13e510d31b810af4b697f05bf7'
tier: L3
related:
  - '[[2026-08-01-approval-shape-reconciliation-adr]]'
  - '[[2026-08-01-approval-shape-reconciliation-cross-repo-inventory-reference]]'
---

# `approval-shape-reconciliation` plan

## Description

This plan executes the `approval-shape-reconciliation` ADR (accepted 2026-08-01), which reconciles three shapes of one approval fact across the dashboard engine, the dashboard frontend, and A2A. Wave `W01` (dashboard `engine/`) covers D2 (delete the dead review-authority branch), D1 (split `ApprovalRequirement` and enforce the destructive-human floor at the two live domain seams), and D5's engine half (strip `session_override` end to end plus a forward-amendment note on the operation-modes ADR). Wave `W02` (dashboard `frontend/src`) mirrors D1's new token and D5's stripped wire fields on the served policy projection. Wave `W03` (`vaultspec-a2a` `src/`) covers D4 (split the pause-cause constant), D3 (refuse document-approval pauses at the respond route), D6 (unify the legacy plan gate and the respond DTO on the verdict vocabulary), and D7 (verify, not implement, the two preserved properties plus the explicitly undecided Kimi and Claude allowlist reachability question).

D7 and the explicitly undecided Claude auto-approve-fallback question (ADR Consequences, final paragraph) are verify-and-report Steps only (`W03.P09.S37`, `S38`). They change no behaviour, per the ADR's own instruction not to decide what it left open.

One judgment call beyond the ADR's literal text: D4 says the shared pause-cause constant splits into two classifications. This plan keeps `PLAN_APPROVAL_PAUSE_CAUSES`'s name, fixing only its misleading comment, for the projection and FSM classification use across `projection.py`, `permission_fsm.py`, and `thread_service.py`, and adds a new, narrower `LOCALLY_RESPONDABLE_PAUSE_CAUSES` for `permission_service.py`'s respond-route gating, rather than renaming the broad constant across every call site. This is a scope-minimizing reading of the ADR's word split, not a literal rename of the existing symbol; flag during review if a full rename was intended.

Wave sequencing: `W03` is independent of `W01` and `W02` (a2a's D3, D4, and D6 do not depend on the engine rename, per the ADR's own Consequences). Within `W03`, `P07` (refuse, D3) is sequenced before `P08` (unify on the verdict vocabulary, D6) per the ADR's explicit instruction that D6 should land with or after D3. Within `W01`, `P01` (delete dead code, D2) precedes `P02` (the requirement-split refactor, D1) so nothing refactors code a later Step would otherwise have removed; `P03` (strip session_override, D5) follows since it touches the same `policy.rs` functions `P02` leaves in place.

## Steps

## Wave `W01` - Engine policy and security reconciliation

Delete the dead review-authority branch, split the approval requirement to enforce the destructive-human floor at its two live domain seams, and strip the modelled-but-unreachable session_override layer end to end, in the dashboard engine crate.

### Phase `W01.P01` - Delete the dead review-authority branch

Remove the origin_author field, the review-authority clause, is_review_authority_command, and the now-orphaned reviewer_eligibility wrapper, since the only production caller of the review-authority branch is being deleted.

- [x] `W01.P01.S01` - Remove the origin_author field from CommandAuthorization, delete the review-authority clause from authorize_command, delete is_review_authority_command, and remove the test exercising the deleted clause; `engine/crates/vaultspec-api/src/authoring/security.rs`.
- [x] `W01.P01.S02` - Delete the now-orphaned reviewer_eligibility wrapper and its unit test since its only caller was the deleted review-authority clause; `engine/crates/vaultspec-api/src/authoring/policy.rs`.
- [x] `W01.P01.S03` - Drop the origin_author parameter from run_authorization and its CommandAuthorization construction, and remove the trailing None argument from its own call site; `engine/crates/vaultspec-api/src/authoring/http/handlers1.rs`.
- [x] `W01.P01.S04` - Drop the trailing None origin_author argument from the run_authorization call in the agent tool dispatch path; `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs`.
- [x] `W01.P01.S05` - Drop the trailing None origin_author argument from the route layer run_authorization call; `engine/crates/vaultspec-api/src/authoring/http/mod.rs`.

### Phase `W01.P02` - Split the approval requirement and enforce the destructive-human floor

Add the ReviewerApprovalRequired variant so the manual non-destructive case stops lying about a human requirement it never checked, and enforce the destructive floor as a Human-kind refusal at the two live domain seams that already back the served eligibility.

- [x] `W01.P02.S06` - Add the ReviewerApprovalRequired variant to ApprovalRequirement, update the approval_requirement matrix so manual non-destructive yields it, and correct decision_reason and system_auto_approval_eligibility wording for the three way split; `engine/crates/vaultspec-api/src/authoring/policy.rs`.
- [x] `W01.P02.S07` - Enforce the destructive floor inside review_decision_eligibility by reusing changeset_risk to refuse a non Human approver on a destructive changeset, with a test proving an agent reviewer is denied approving a destructive changeset; `engine/crates/vaultspec-api/src/authoring/approvals.rs`.
- [x] `W01.P02.S08` - Enforce the same destructive floor Human kind refusal at the apply preflight seam, with a test proving a distinct agent actor is denied applying an approved destructive changeset; `engine/crates/vaultspec-api/src/authoring/apply/mod.rs`.

### Phase `W01.P03` - Strip the session-override layer end to end

Remove the modelled-but-unreachable session_override parameter from the executor and permission-input request types, the served policy projection fields, and the mode-resolution helpers that only ever received None in production, then amend the operation-modes ADR to state the layer is rescinded until a real consumer exists.

- [x] `W01.P03.S09` - Delete resolve_effective_mode and session_override_is_narrowing, remove session_override and session_override_ignored from PolicyDecisionProjection, and simplify decide_changeset_approval and decision_reason to drop the removed parameter; `engine/crates/vaultspec-api/src/authoring/policy.rs`.
- [x] `W01.P03.S10` - Remove the session_override field from ExecuteToolCallRequest and its plumb through into the tool permission input construction; `engine/crates/vaultspec-api/src/authoring/executor.rs`.
- [x] `W01.P03.S11` - Remove the session_override field from ToolPermissionRequestInput and use scope_mode directly instead of the deleted mode resolution helper; `engine/crates/vaultspec-api/src/authoring/permissions.rs`.
- [x] `W01.P03.S12` - Update the decide_changeset_approval call to drop the removed session_override argument; `engine/crates/vaultspec-api/src/authoring/modes.rs`.
- [x] `W01.P03.S13` - Update the served policy projection call to decide_changeset_approval to drop the removed session_override argument; `engine/crates/vaultspec-api/src/authoring/projections/mod.rs`.
- [x] `W01.P03.S14` - Remove the session_override None line from the ExecuteToolCallRequest construction in the agent tool execute route; `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs`.
- [x] `W01.P03.S15` - Remove the session_override None line from the tool permission request fixture; `engine/crates/vaultspec-api/src/authoring/session/janitor.rs`.
- [x] `W01.P03.S16` - Remove the session_override None line from the HTTP test helper tool permission request construction; `engine/crates/vaultspec-api/src/authoring/http/tests/helpers2.rs`.
- [x] `W01.P03.S17` - Add a forward amendment note stating the per session override layer is rescinded until a real consumer exists, leaving the original clause intact per the clause level amendment convention; `.vault/adr/2026-07-02-agentic-operation-modes-adr.md`.

## Wave `W02` - Dashboard frontend mirror

Adopt the split approval-requirement token in the served policy vocabulary and strip the session_override wire fields, keeping the client a pure renderer of backend-served policy truth with no client-side re-derivation.

### Phase `W02.P04` - Adopt the reviewer-approval-required token

Widen the served ApprovalRequirement union, add the reviewer-approval label set, and correct the manual-mode human-approval label now that it denotes the destructive floor rather than the general manual gate.

- [x] `W02.P04.S18` - Widen the ApprovalRequirement union to include reviewer_approval_required; `frontend/src/stores/server/authoring/wireTypes.ts`.
- [x] `W02.P04.S19` - Add reviewer approval descriptor entries to POLICY_DESCRIPTORS for all three modes and repoint the manual human approval entry at the destructive floor wording; `frontend/src/stores/server/authoring/reviewStationVocabulary.ts`.
- [x] `W02.P04.S20` - Add the three reviewer approval policy copy strings and reword the manual human approval string off its former reviewer approval phrasing; `frontend/src/locales/en/documents.ts`.
- [x] `W02.P04.S21` - Extend the exhaustive ApprovalRequirement coverage test to include the new reviewer approval required token; `frontend/src/stores/server/authoring/reviewStationVocabulary.test.ts`.

### Phase `W02.P05` - Strip session_override from the served projection

Remove the session_override and session_override_ignored fields from the served policy projection type and its adapter mapping, matching the engine's stripped wire shape.

- [x] `W02.P05.S22` - Remove the session_override and session_override_ignored fields from the PolicyDecisionProjection wire type; `frontend/src/stores/server/authoring/wireTypes.ts`.
- [x] `W02.P05.S23` - Remove the session_override and session_override_ignored mapping lines from the policy decision adapter; `frontend/src/stores/server/authoring/adapters.ts`.
- [x] `W02.P05.S24` - Remove the session_override and session_override_ignored fixture lines from the authoring store test; `frontend/src/stores/server/authoring.test.ts`.
- [x] `W02.P05.S25` - Remove the session_override_ignored fixture line from the review station render test; `frontend/src/app/authoring/ReviewStation.render.test.tsx`.

## Wave `W03` - A2A respond route and verdict reconciliation

Refuse document-approval pauses at the A2A respond route, split the pause-cause constant so a locally-answerable set never includes the document gate, unify the legacy plan gate and the respond DTO onto the verdict vocabulary, and verify the two properties the ADR preserves rather than changes. Independent of Wave W01's engine rename; only the internal sequencing across this Wave's Phases is ordered.

### Phase `W03.P06` - Split the pause-cause constant and correct its comment

Add a locally-respondable pause-cause set that excludes document_approval_request, keep the existing broader set for its legitimate projection and FSM classification use, and correct the comment that falsely claims both gates park with the same shape.

- [x] `W03.P06.S26` - Add a LOCALLY_RESPONDABLE_PAUSE_CAUSES set that excludes document_approval_request and correct the misleading comment on PLAN_APPROVAL_PAUSE_CAUSES to describe it as a projection and FSM classification rather than an answerability set; `src/vaultspec_a2a/thread/snapshots.py`.
- [x] `W03.P06.S27` - Re export LOCALLY_RESPONDABLE_PAUSE_CAUSES alongside the existing pause cause export; `src/vaultspec_a2a/thread/__init__.py`.

### Phase `W03.P07` - Refuse document-approval pauses at the respond route

Return a typed refusal naming the engine review surface as the deciding authority the moment a respond call targets a document-approval pause, before any transition or approval-status write is attempted.

- [x] `W03.P07.S28` - Refuse a respond call against a document approval pause with a typed error naming the engine review surface, before the idempotency and transition logic runs, and narrow the local branching in the transition and approval status blocks to the locally respondable set; `src/vaultspec_a2a/control/permission_service.py`.
- [x] `W03.P07.S29` - Add a test proving a respond call against a document_approval_request pause is refused and never constructs an approved boolean resume; `src/vaultspec_a2a/control/tests/test_permission_rejection_journal.py`.

### Phase `W03.P08` - Unify on the verdict vocabulary

Retire the approved-boolean parse and construction on the legacy plan gate and the respond transition together, in one cutover, and give the respond DTO an optional notes field so a reviewer comment survives the resume.

- [x] `W03.P08.S30` - Promote the private verdict parsing helper to a public exported function so the legacy plan gate can reuse it instead of re deriving verdict parsing; `src/vaultspec_a2a/graph/nodes/phase_gate.py`.
- [x] `W03.P08.S31` - Rewrite the plan approval node to parse the verdict shape via the promoted helper instead of the approved boolean shape, and correct its docstring resume shape description; `src/vaultspec_a2a/graph/nodes/supervisor.py`.
- [x] `W03.P08.S32` - Retire the approved boolean resume construction in favor of the verdict and notes shape for the locally respondable pause set, threading a new notes parameter through the respond service; `src/vaultspec_a2a/control/permission_service.py`.
- [x] `W03.P08.S33` - Add an optional notes field to the permission respond request schema; `src/vaultspec_a2a/api/schemas/gateway.py`.
- [x] `W03.P08.S34` - Thread the request notes field into the respond service call; `src/vaultspec_a2a/api/routes/gateway.py`.
- [x] `W03.P08.S35` - Add a test proving the legacy plan gate now parses the verdict shape and no longer accepts the retired approved boolean shape; `src/vaultspec_a2a/graph/tests/nodes/test_supervisor.py`.
- [x] `W03.P08.S36` - Add a test proving the respond endpoint accepts an optional notes field and that it survives into the verdict resume payload; `src/vaultspec_a2a/api/tests/test_endpoints.py`.

### Phase `W03.P09` - Verify the preserved properties and report the open question

Confirm no production A2A path sets the engine operation mode and check what the Kimi family's exact-name allowlist holds at call time for a mutating tool under autonomy, reporting both as read-only findings with no behaviour change.

- [x] `W03.P09.S37` - Grep the codebase for any production call to the engine operation mode setting endpoint outside this acceptance test, confirm none exists, and record the finding as a durable comment marking this test the sole sanctioned caller; `src/vaultspec_a2a/service_tests/test_pw7_acceptance.py`.
- [x] `W03.P09.S38` - Trace whether a mutating tool call can reach the Claude family auto approve first option branch under autonomy and record the reachability finding as a durable comment, changing no behaviour; `src/vaultspec_a2a/providers/lane_admission.py`.

## Parallelization

`W01` must land before `W02` (the frontend mirrors the engine's served token and stripped fields). `W03` has no dependency on `W01` or `W02` and may run fully in parallel with both.

Within `W01`: `P01` before `P02` before `P03` (deletions before the refactor that reuses `changeset_risk`, then the session-override strip that touches the functions `P02` leaves in place). `P02.S06` (the `policy.rs` matrix and reason text) must land before `P02.S07` and `P02.S08` can name its new destructive-floor language. `P03.S09` (`policy.rs`) must land before `P03.S10` through `P03.S13` (its callers). `P01`'s five Steps are each a single, distinct file and may be parallelized freely.

Within `W02`: `P04` before `P05` (both touch `wireTypes.ts`; `P04`'s union widening should land before `P05`'s field removal to avoid a needless merge conflict on the same file).

Within `W03`: `P06` (split the constant) before `P07` (refuse, consumes the new constant) before `P08` (unify on the verdict vocabulary). `P09` has no dependency on `P06` through `P08` and may run at any point.

## Verification

The plan is complete when every Step is closed. Additional criteria beyond checkbox state:

- `W01.P02.S07` and `S08` each carry a test that is RED before the change and GREEN after: an agent actor, distinct from the proposer so the pre-existing self-approval ban alone would allow it, attempting to approve, respectively apply, a destructive changeset is denied.
- `W03.P07.S29` carries a test proving a respond call against a `document_approval_request` pause is refused before any transition write, never constructing the retired approved-boolean shape.
- `W03.P08.S35` and `S36` prove the legacy plan gate and the respond endpoint both speak the verdict-and-notes shape end to end.
- `just lint frontend`, `just lint all`, and the touched-scope test suites (`cargo test -p vaultspec-api`, the touched `npx vitest run` scopes, and the a2a `pytest` scopes for every touched module) pass before any Phase is routed to review, per the project's dev-workflow rule.
- `vaultspec-core vault check all` reports clean on this plan document.
- D7's two verify-and-report Steps (`S37`, `S38`) each leave a durable, honest comment recording their finding; neither changes behaviour.
