---
tags:
  - '#plan'
  - '#ledgered-edit-migration'
date: '2026-07-09'
modified: '2026-07-10'
tier: L3
related:
  - '[[2026-07-09-ledgered-edit-migration-adr]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-plan]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `ledgered-edit-migration` plan

## Wave `W01` - Editor identity and Save cutover

Bootstrap a first-class editor actor identity and wire the highest-leverage, lowest-risk edit surface (the Save button's body replacement) to the existing self-approving direct-write route, so the product lands ledgered value before the harder operation kinds are wired.

### Phase `W01.P01` - Editor actor-token bootstrap

Generalize the review station's token issuance into a shared current-editor human identity, so an editing session mints one human actor token via the machine-bearer-gated issue route before any ledgered edit can fire.

- [x] `W01.P01.S01` - Ground editor actor-token bootstrap and human self-approval legality requirements into the phase checklist; `.vault/adr/`.
- [x] `W01.P01.S02` - Implement a shared current-editor human identity hook that generalizes the review station's actor-token issuance for a plain editing session; `frontend/src/stores/server/authoring.ts`.
- [x] `W01.P01.S03` - Add tests for token bootstrap, fail-safe refusal of an edit with no identity, and the same principal being visible across the editor and the review station; `frontend/src/stores/server/authoring.ts`.
- [x] `W01.P01.S04` - Run Editor actor-token bootstrap code review and record the phase audit; `.vault/audit/`.
- [x] `W01.P01.S05` - Verify a fresh editing session mints one human actor token before any ledgered edit can fire; `frontend/src/app/viewer/MarkdownDocView.tsx`.

### Phase `W01.P02` - Save button body cutover to the direct-write route

Add a direct-write client method to the authoring store and replace the Save button's legacy set-body ops dispatch with the existing self-approving body-replacement route, surfacing its conflict shape in the editor UX.

- [x] `W01.P02.S06` - Ground direct-write route contract and legacy set-body dispatch replacement requirements into the phase checklist; `.vault/adr/`.
- [x] `W01.P02.S07` - Implement a directWrite client method on the authoring store and wire the Save button to mint its actor token and call POST /authoring/v1/direct-writes; `frontend/src/stores/server/authoring.ts`.
- [x] `W01.P02.S08` - Remove useSaveBody's legacy ops:run set-body/write dispatch and surface the direct-write conflict shape in the editor save UX; `frontend/src/stores/server/queries.ts`.
- [x] `W01.P02.S09` - Rewrite editorWriteSeam.test.tsx's useSaveBody request-construction coverage to spy the authoring direct-write call instead of the legacy dispatchOps set-body op, covering the happy path and denied/conflicted outcomes; `frontend/src/stores/server/editorWriteSeam.test.tsx`.
- [x] `W01.P02.S10` - Run Save button body cutover code review and record the phase audit; `.vault/audit/`.
- [x] `W01.P02.S11` - Verify the Save button's body edit produces a changeset with provenance and no live path still calls the legacy set-body write route; `frontend/src/stores/server/opsActions.ts`.

## Wave `W02` - Backend operation-kind apply wiring

Extend validation, materialization, preimage capture, apply, rollback, and conflict detection to the remaining content operation kinds (edit-frontmatter, rename, create-document) via the already-implemented core-adapter capabilities, and generalize the single-call direct-edit route so each kind gets a self-approving human-save path symmetric with body replacement.

### Phase `W02.P03` - EditFrontmatter apply wiring

Wire validation, materialization, preimage capture, apply, rollback, and conflict detection for frontmatter edits through the existing SetFrontmatter core-adapter capability.

- [x] `W02.P03.S12` - Ground EditFrontmatter validation, materialization, and rollback requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P03.S13` - Implement EditFrontmatter draft validation accepting the operation kind and its field-level payload shape; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [x] `W02.P03.S14` - Implement EditFrontmatter materialization, preimage capture, and apply through the SetFrontmatter core-adapter capability; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W02.P03.S15` - Implement EditFrontmatter conflict detection and preimage-restore rollback; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [x] `W02.P03.S16` - Add tests for EditFrontmatter validation, apply, base-revision conflict, and preimage-restore rollback; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W02.P03.S17` - Run EditFrontmatter apply wiring code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P03.S18` - Verify a proposed EditFrontmatter changeset applies, records provenance, and rolls back to the exact preimage; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.

### Phase `W02.P04` - Rename apply wiring

Wire validation, materialization, preimage capture, apply, and rollback for rename operations through the existing Rename core-adapter capability, treating rename as a destructive risk class with a rename-back inverse.

- [x] `W02.P04.S19` - Ground Rename validation, destructive risk classification, and rename-back rollback requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P04.S20` - Implement Rename draft validation accepting the operation kind and its target-stem payload shape; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [x] `W02.P04.S21` - Implement Rename materialization, preimage capture, and apply through the Rename core-adapter capability; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W02.P04.S22` - Implement Rename conflict detection and rename-back rollback; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [x] `W02.P04.S23` - Add tests for Rename validation, apply, path-collision conflict, and rename-back rollback; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W02.P04.S24` - Run Rename apply wiring code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P04.S25` - Verify a proposed Rename changeset applies, records provenance, and rolls back to the original stem; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.

### Phase `W02.P05` - CreateDocument apply wiring

Wire validation, materialization, and apply for document creation through the existing CreateDocument core-adapter capability, honestly recording rollback_available=false with a reason since creation has no preimage.

- [x] `W02.P05.S26` - Ground CreateDocument validation and honest non-rollback-eligible recording requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P05.S27` - Implement CreateDocument draft validation accepting the operation kind and its typed create-params payload shape; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [x] `W02.P05.S28` - Implement CreateDocument materialization and apply through the CreateDocument core-adapter capability, recording rollback_available=false with a reason since there is no preimage; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W02.P05.S29` - Add tests for CreateDocument validation, apply, duplicate-stem conflict, and the honest non-rollback-eligible outcome; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W02.P05.S30` - Run CreateDocument apply wiring code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P05.S31` - Verify a proposed CreateDocument changeset applies, scaffolds a real vault document, and reports rollback_available=false with an honest reason; `engine/crates/vaultspec-api/src/authoring/apply.rs`.

### Phase `W02.P05a` - Propose-side operation-kind generalization

The apply-side wiring (P03 EditFrontmatter, P04 Rename, P05 CreateDocument) makes those kinds materializable and appliable, but the STANDARD multi-step propose surface still cannot construct them: proposal.rs's shared materialize_drafts helper — used by create_proposal, append_draft, AND replace_draft (the canonical human/agent propose -> review -> approve -> apply commands, and the LangGraph propose_changeset tool path) — is hardcoded to materialize_replace_body, exactly as apply.rs was before P03. So today a frontmatter/rename/create changeset can only be built via the single-call direct-write (auto-approved human save) path or a hand-built ledger write; an agent (or a human in assisted/manual mode) proposing a non-body edit for review hits UnsupportedOperationKind. This phase is the propose-side twin of the apply-side wiring: generalize materialize_drafts to dispatch to the per-kind materializers (materialize_edit_frontmatter / materialize_rename / materialize_create) on the draft's own operation kind, reusing the same shared tails, so the full propose -> review -> approve -> apply flow works for every migrated content kind, not just direct-write. Discovered during P04 (2026-07-09); predates P03/P04, out of their apply-side scope.

- [x] `W02.P05a.S82` - Ground propose-side operation-kind generalization requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P05a.S83` - Generalize materialize_drafts to dispatch to the per-kind materializers (frontmatter, rename, create) on the draft operation kind instead of hardcoding replace_body, so create_proposal, append_draft, and replace_draft accept every migrated content kind; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.
- [x] `W02.P05a.S84` - Add tests proving the standard multi-step propose to review to approve to apply flow constructs and applies a frontmatter changeset and a rename changeset through create_proposal, not only direct-write; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.
- [x] `W02.P05a.S85` - Run Propose-side operation-kind generalization code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P05a.S86` - Verify an agent or human can propose a non-body edit for review through the standard propose to approve flow and it applies with provenance and rollback eligibility; `engine/crates/vaultspec-api/src/authoring/proposal.rs`.

### Phase `W02.P06` - Operation-typed direct-edit route

Generalize the single-call self-approving direct-write composition so frontmatter, rename, and create-document each get a human-save path symmetric with the existing body-replacement route.

- [x] `W02.P06.S32` - Ground operation-typed direct-edit route symmetry and self-approval requirements into the phase checklist; `.vault/adr/`.
- [x] `W02.P06.S33` - Generalize DirectWriteRequest to carry the EditFrontmatter, Rename, and CreateDocument payload shapes alongside body replacement; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [x] `W02.P06.S34` - Generalize execute_direct_write to compose propose, self-approve, and apply for the newly-wired operation kinds through the same single-call route; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.
- [x] `W02.P06.S35` - Add route tests for direct-write frontmatter, rename, and create requests, covering success, denial, and conflict outcomes; `engine/crates/vaultspec-api/src/authoring/http.rs`.
- [x] `W02.P06.S36` - Run Operation-typed direct-edit route code review and record the phase audit; `.vault/audit/`.
- [x] `W02.P06.S37` - Verify POST /authoring/v1/direct-writes accepts a human-save request for every wired content operation kind end to end; `engine/crates/vaultspec-api/src/authoring/http.rs`.

## Wave `W03` - Frontend rewire of the remaining content edits

Rewire the frontmatter panel, rename affordance, create dialog, and relate/link action to the operation-typed ledgered path, modeling relate/link as a frontmatter edit on the source document's related list, and remove the dead archive/link mutation hooks.

### Phase `W03.P07` - Frontmatter panel rewire

Rewire the frontmatter panel's mutation hook from the legacy set-frontmatter ops dispatch to the operation-typed direct-edit route.

- [x] `W03.P07.S38` - Ground frontmatter-panel direct-write cutover requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P07.S39` - Rewire useSetFrontmatter to mint the editor actor token and call the operation-typed direct-edit route instead of the legacy set-frontmatter ops dispatch; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P07.S40` - Add tests for the ledgered frontmatter save happy path, denied/conflicted outcomes, and the removal of the legacy set-frontmatter dispatch; `frontend/src/stores/server/editorMutations.test.ts`.
- [x] `W03.P07.S80` - Rewrite editorWriteSeam.test.tsx's useSetFrontmatter request-construction coverage to spy the authoring direct-write call instead of the legacy dispatchOps set-frontmatter op, covering the happy path and denied/conflicted outcomes; `frontend/src/stores/server/editorWriteSeam.test.tsx`.
- [x] `W03.P07.S41` - Run Frontmatter panel rewire code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P07.S42` - Verify a frontmatter panel edit produces a changeset with provenance and no live path still calls the legacy set-frontmatter write route; `frontend/src/stores/server/opsActions.ts`.

### Phase `W03.P08` - Rename affordance rewire

Rewire the rename mutation hook from the legacy ops dispatch to the operation-typed direct-edit route.

- [x] `W03.P08.S43` - Ground rename-affordance direct-write cutover requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P08.S44` - Rewire useRenameDoc to mint the editor actor token and call the operation-typed direct-edit route instead of the legacy rename ops dispatch; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P08.S45` - Add tests for the ledgered rename happy path, denied/conflicted outcomes, and the removal of the legacy rename dispatch; `frontend/src/stores/server/editorMutations.test.ts`.
- [x] `W03.P08.S81` - Add editorWriteSeam.test.tsx request-construction coverage for useRenameDoc against the authoring direct-write call, covering the happy path and denied/conflicted outcomes; `frontend/src/stores/server/editorWriteSeam.test.tsx`.
- [x] `W03.P08.S46` - Run Rename affordance rewire code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P08.S47` - Verify a rename produces a changeset with provenance and no live path still calls the legacy rename write route; `frontend/src/stores/server/opsActions.ts`.

### Phase `W03.P09` - Create dialog rewire

Rewire the create-document mutation hook and its dialog trigger from the legacy ops create dispatch to the operation-typed direct-edit route.

- [x] `W03.P09.S48` - Ground create-dialog direct-write cutover requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P09.S49` - Rewire useCreateDoc to mint the editor actor token and call the operation-typed direct-edit route instead of the legacy create ops dispatch; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P09.S50` - Update the create-document dialog trigger to surface the ledgered create outcome, including the honest non-rollback-eligible state; `frontend/src/app/stage/CreateDocButton.tsx`.
- [x] `W03.P09.S51` - Add editorWriteSeam.test.tsx request-construction coverage for useCreateDoc against the authoring direct-write call, covering the happy path and denied/conflicted outcomes; `frontend/src/stores/server/editorWriteSeam.test.tsx`.
- [x] `W03.P09.S52` - Run Create dialog rewire code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P09.S53` - Verify a document creation produces a changeset with provenance and no live path still calls the legacy create write route; `frontend/src/stores/server/opsActions.ts`.

### Phase `W03.P09a` - CreateDocument identity echo

The direct-write create outcome carries no field naming the actually-created document: record.document_path resolves an existing target (always empty for a create, which has none), and DocumentRef::MaterializedResult — the modeled variant that WOULD carry result_node_id/result_path, with a projection reader already ready in projections.rs — is dormant scaffolding never constructed at CreateDocument apply completion. Discovered in W03.P09 (2026-07-09): the create succeeds and the new document appears in the vault tree (queries invalidate), but the frontend cannot auto-navigate to it (nodeId is null), a UX regression versus the legacy /ops/core/create path which returned the new identity. This phase wires MaterializedResult into CreateDocument's apply completion so the create outcome + apply receipt echo the real path/stem/node-id, then restores the frontend auto-open. Backend scaffolding already exists; this is wiring, not new modeling.

- [x] `W03.P09a.S87` - Ground CreateDocument identity-echo requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P09a.S88` - Wire MaterializedResult into CreateDocument apply completion so the create outcome and apply receipt echo the created document result_node_id/result_path/result_stem; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W03.P09a.S89` - Restore the frontend create auto-open: read the echoed new-document identity from the direct-write outcome and navigate to it in CreateDocButton; `frontend/src/app/stage/CreateDocButton.tsx`.
- [x] `W03.P09a.S90` - Add tests for the echoed create identity end to end (backend outcome carries the real path, frontend auto-opens the created document); `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [x] `W03.P09a.S91` - Run CreateDocument identity-echo code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P09a.S92` - Verify a ledgered create echoes the new document identity and the create dialog auto-opens it, restoring parity with the legacy path; `frontend/src/app/stage/CreateDocButton.tsx`.

### Phase `W03.P10` - Relate/link rewire and dead-hook removal

Model relate/link as a frontmatter edit on the source document's related list through the ledgered path, and remove the dead relate/archive mutation hooks that never reach a live surface.

- [x] `W03.P10.S54` - Ground relate/link-as-frontmatter-edit modeling and dead-hook removal requirements into the phase checklist; `.vault/adr/`.
- [x] `W03.P10.S55` - Rewire relateToSelectionAction to compose the related list mutation as a frontmatter edit dispatched through the operation-typed direct-edit route; `frontend/src/app/menus/sharedActions.ts`.
- [x] `W03.P10.S56` - Remove the dead useRelateDoc and useArchiveFeature mutation hooks that never reach a live editor surface; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P10.S57` - Add sharedActions.test.ts coverage for the relate/link-as-frontmatter-edit request construction against the authoring direct-write call, covering the happy path and denied/conflicted outcomes; `frontend/src/app/menus/sharedActions.test.ts`.
- [x] `W03.P10.S58` - Run Relate/link rewire and dead-hook removal code review and record the phase audit; `.vault/audit/`.
- [x] `W03.P10.S59` - Verify relating two documents produces a changeset with provenance and no live path still calls the legacy link write route; `frontend/src/stores/server/opsActions.ts`.

## Wave `W04` - Maintenance re-scope, legacy removal, and final gate

Re-scope feature-archive and autofix as sanctioned non-ledgered vault-maintenance operations on a separated admin surface, delete the legacy /ops/core write path (routes, frontend dispatch modes, client methods, and the tests pinning the legacy shape) as a true cutover, and close the migration with a full gate and epic audit.

### Phase `W04.P11` - Vault-maintenance re-scope

Re-scope feature-archive and autofix as sanctioned non-ledgered vault-maintenance operations, removed from the editor's edit affordances and documented as out-of-ledger by design with a return trigger.

- [x] `W04.P11.S60` - Ground the non-ledgered vault-maintenance operation boundary and return-trigger requirements into the phase checklist; `.vault/adr/`.
- [x] `W04.P11.S61` - Remove feature-archive and autofix from the editor's edit affordances and surface them only on a clearly-labeled separated admin path; `frontend/src/stores/server/opsActions.ts`.
- [x] `W04.P11.S62` - Update the ops whitelist labels and dispatch documentation to state feature-archive and autofix are non-ledgered vault-maintenance operations, not document edits; `frontend/src/stores/server/opsActions.ts`.
- [x] `W04.P11.S63` - Add tests confirming feature-archive and autofix are unreachable from editor edit surfaces and remain reachable only from the admin path; `frontend/src/stores/server/opsActions.test.ts`.
- [x] `W04.P11.S64` - Run Vault-maintenance re-scope code review and record the phase audit; `.vault/audit/`.
- [x] `W04.P11.S65` - Verify no editor edit affordance can trigger feature-archive or autofix and both remain available on the admin surface; `frontend/src/stores/server/opsActions.ts`.

### Phase `W04.P12` - Legacy write-path removal

Delete the migrated /ops/core write routes and handlers, the frontend ops write/create/link dispatch modes, the opsCore write client methods and their body types, and the tests pinning the legacy shape, keeping the read control verbs and retained maintenance ops intact.

- [x] `W04.P12.S66` - Ground the true-cutover legacy removal scope (write routes, dispatch modes, client methods, pinning tests) into the phase checklist; `.vault/adr/`.
- [x] `W04.P12.S67` - Delete the ops_core_write, ops_core_create, and ops_core_link handlers and their lib.rs route registrations for the migrated content verbs; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W04.P12.S68` - Delete the frontend write, create, and link ops dispatch modes and their payload types, keeping the retained archive and autofix modes; `frontend/src/stores/server/opsActions.ts`.
- [x] `W04.P12.S69` - Delete the opsCoreWrite, opsCoreCreate, and opsCoreLink client methods and the Ops*Body write/create/link types, keeping the retained control, archive, and autofix methods; `frontend/src/stores/server/engine.ts`.
- [x] `W04.P12.S70` - Update the pinning tests to assert the legacy write/create/link shapes are gone and only the retained read and maintenance verbs remain; `frontend/src/stores/server/engine.test.ts`.
- [x] `W04.P12.S73` - Update opsActions.test.ts to assert the write/create/link dispatch modes are gone and only control, archive, and autofix modes remain reachable; `frontend/src/stores/server/opsActions.test.ts`.
- [x] `W04.P12.S71` - Run Legacy write-path removal code review and record the phase audit; `.vault/audit/`.
- [x] `W04.P12.S72` - Verify /ops/core/{verb}/write, /ops/core/create, and /ops/core/link are gone from the served route table while vault-check, vault-stats, archive, and autofix remain; `engine/crates/vaultspec-api/src/lib.rs`.

### Phase `W04.P13` - Final gate and epic audit

Run the full Rust and frontend gates plus live e2e verification, confirm release readiness, and close the migration with an epic audit.

- [x] `W04.P13.S74` - Ground the migration's Verification criteria and release-readiness bar into the phase checklist; `.vault/adr/`.
- [x] `W04.P13.S75` - Run the full Rust gate (cargo fmt --check + clippy + tests) across the authoring and routes crates touched by the migration; `engine/`.
- [x] `W04.P13.S76` - Run the full frontend gate (eslint + prettier + tsc + vitest against the live engine) across the stores, app, and menu surfaces touched by the migration; `frontend/`.
- [x] `W04.P13.S77` - Live-verify the four migrated edit surfaces (Save, frontmatter, rename, create) and relate/link end to end against a running dashboard, confirming each produces a changeset with provenance; `frontend/src/app/viewer/MarkdownDocView.tsx`.
- [x] `W04.P13.S78` - Run Final gate and epic audit code review and record the closing audit for the ledgered-edit-migration feature; `.vault/audit/`.
- [x] `W04.P13.S79` - Verify every Step in the plan is closed and no product edit surface dispatches through the retired /ops/core write path; `.vault/plan/`.

## Wave `W05` - Post-migration hardening

The two follow-ons recorded in the epic closeout audit, now driven to completion: replace the direct-write collision reason-substring matching with a structured wire discriminator, and resolve the CreateDocument rollback-inverse gap. Added 2026-07-09 after the epic reached 92/92; both were named as hardening/deferral in the closeout, not defects.

### Phase `W05.P14` - Structured direct-write denial discriminator

The frontend routes a rename/create path-collision by substring-matching the backend's denial reason text (RENAME_COLLISION_REASON_HINT 'already exists at the proposed stem'), mirroring the backend's own conflict-vs-denied reason-sniffing (contains base/stale). This is fragile: a backend reason-wording change silently breaks collision detection (falls through to a generic refusal). Carry the structured denial kind through to the direct-write outcome so the frontend reads a machine-readable discriminator instead of matching prose, and both sides stop reason-sniffing.

- [ ] `W05.P14.S93` - Ground the structured-denial-discriminator design: trace where the collision conflict kind is known and lost to a reason string; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.
- [ ] `W05.P14.S94` - Carry a machine-readable denial-kind discriminator (path-collision, stale-base, scope-mismatch, forbidden-actor) onto the direct-write outcome instead of only the reason string; `engine/crates/vaultspec-api/src/authoring/direct_write.rs`.
- [ ] `W05.P14.S95` - Rewire the frontend rename and create outcome mapping to route on the structured discriminator instead of substring-matching the reason text; `retire RENAME_COLLISION_REASON_HINT; `frontend/src/stores/server/queries.ts`.
- [ ] `W05.P14.S96` - Add tests proving the backend tags the discriminator and the frontend routes collision without reason-sniffing; `frontend/src/stores/server/editorWriteSeam.test.tsx`.
- [ ] `W05.P14.S97` - Run Structured direct-write denial discriminator code review and record the phase audit; `.vault/audit/`.
- [ ] `W05.P14.S98` - Verify a rename/create collision routes to the collision UI on the structured discriminator alone, with a reason-wording change no longer able to break detection; `frontend/src/stores/server/queries.ts`.

### Phase `W05.P15` - CreateDocument rollback-inverse disposition

A ledgered CreateDocument ships non-rollback-eligible (honest rollback_available=false with reason) because its inverse is a document delete and the ledger has no delete verb. Resolve the gap: vaultspec-core exposes no single-document delete/remove verb (its vault verbs are set-body/set-frontmatter/edit/rename/add/link), and the authoring boundary forbids raw-fs or git deletes, so a compliant delete-inverse is gated on an upstream vaultspec-core capability. Determine the feasibility definitively, file the coordination ask toward vaultspec-core, and record the disposition; the ADR's non-invertible deferral stands until the upstream verb lands.

- [ ] `W05.P15.S99` - Ground the CreateDocument delete-inverse feasibility against vaultspec-core's verb surface and the authoring boundary; `.vault/adr/`.
- [ ] `W05.P15.S100` - File the vaultspec-core single-document-delete coordination ask and record the delete-inverse disposition in the feature reference; `.vault/reference/`.
- [ ] `W05.P15.S101` - Verify the disposition is recorded and CreateDocument's honest non-rollback-eligible state is preserved until the upstream verb lands; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.

## Description

This plan executes the accepted `ledgered-edit-migration` ADR: route every genuine
per-document content edit through the ledgered authoring backend (propose, self-approve,
apply) and delete the legacy `/ops/core` write path as a true cutover. The changeset
operation vocabulary and the core-adapter capabilities already exist; the gap is
apply-side wiring for every operation kind beyond whole-document body replacement, and
the fact that the product's actual edit surfaces still dispatch through the un-ledgered
sibling passthrough. Wave 01 bootstraps a first-class editor human identity and migrates
the highest-leverage surface, the Save button, to the already-built self-approving
direct-write route. Wave 02 wires apply, preimage capture, rollback, and conflict
detection for edit-frontmatter, rename, and create-document, and generalizes the
single-call direct-edit route to cover them symmetrically with body replacement. Wave 03
rewires the remaining frontend edit surfaces (frontmatter panel, rename, create dialog,
relate/link) onto the operation-typed ledgered path and removes dead mutation hooks.
Wave 04 re-scopes feature-archive and autofix as sanctioned non-ledgered
vault-maintenance operations, deletes the legacy write routes, dispatch modes, client
methods, and their pinning tests, and closes with a full gate and epic audit.

## Steps

The structural rollout above is the executable plan: 4 Waves, 13 Phases, and 81 Steps.
Every Phase begins with a grounding Step and closes with code review plus a concrete
verification Step. Step execution records should be scaffolded from this plan only after
approval.

## Parallelization

Waves are sequenced by hard dependency and must land in order. W01 establishes the
editor actor-token identity every later ledgered edit threads and migrates the Save
button; W02 depends on nothing W01 built in code but is sequenced after it so the first
shippable surface lands before the harder backend wiring begins. W03 depends on W02's
apply-side wiring for every operation kind it rewires the frontend onto, and cannot start
until each corresponding W02 Phase is closed. W04 depends on W03's cutover of every
content edit surface before it is safe to delete the legacy write path.

Within W01, P01 (token bootstrap) must close before P02 (Save cutover) since the Save
button's direct-write call requires the actor token. Within W02, P03, P04, and P05 wire
independent operation kinds against independent core-adapter capabilities and carry no
interdependency among themselves, so they may run in parallel; P06 (the operation-typed
route) depends on all three and must run after them. Within W03, P07, P08, P09, and P10
each rewire an independent frontend surface against its own already-wired W02 backend
kind and carry no interdependency among themselves, so they may run in parallel. Within
W04, P11 (maintenance re-scope) and P12 (legacy removal) may run in parallel since they
touch disjoint surfaces, but both must close before P13 (final gate and epic audit).

## Verification

The plan is complete when every Step is closed (`- [x]`) and the migration satisfies
every consequence declared in the authorizing ADR.

- The Save button, the frontmatter panel, rename, create, and relate/link each dispatch
  through the ledgered authoring backend and produce a changeset with provenance; none
  calls the legacy `/ops/core` write, create, or link route.
- EditFrontmatter, Rename, and CreateDocument each validate, materialize, apply, and
  (except CreateDocument) roll back to the exact preimage through the existing
  core-adapter capabilities; CreateDocument honestly reports `rollback_available=false`
  with a reason.
- A plain editing session mints one human actor token before any ledgered edit can fire,
  and an edit with no identity is refused, not silently dropped.
- Feature-archive and autofix are reachable only from the separated vault-maintenance
  admin surface, never from an editor edit affordance, and are documented as
  out-of-ledger by design.
- The `/ops/core/{verb}/write`, `/ops/core/create`, and `/ops/core/link` routes, their
  frontend dispatch modes, and their client methods are deleted; the read control verbs
  and the retained maintenance operations still serve.
- The full Rust and frontend gates pass, and the closing epic audit records the migration
  as complete with no un-ledgered content-edit path remaining.
