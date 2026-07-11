---
tags:
  - '#plan'
  - '#section-scoped-operations'
date: '2026-07-11'
modified: '2026-07-11'
tier: L2
related:
  - '[[2026-07-11-section-scoped-operations-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-plan]]'
---

# `section-scoped-operations` plan

### Phase `P01` - Section selector schema and resolution

Define the section-selector schema (structural anchor, base-relative range hint, expected selected-content hash), a generic ATX heading-path resolver that exact-resolves or fails closed with typed evidence, and the validate_section_edit_draft/materialize_section_edit draft-validation path that converges on the shared finish_materialization tail every other operation kind already uses.

- [ ] `P01.S01` - Add DraftMode::SectionScoped and the selector field-level payload (structural anchor, base-relative range hint, expected selected-content hash) on DraftMutation, reusing body for the new section content exactly as ReplaceBody reuses it for whole-document content; `engine/crates/vaultspec-api/src/authoring/api.rs`.
- [ ] `P01.S02` - Create the section-selector module: the SectionSelector schema and a deterministic ATX heading-path resolver that exact-resolves a selector against a document body or returns a typed SectionResolveError (missing anchor, ambiguous duplicate heading, content-hash mismatch); `engine/crates/vaultspec-api/src/authoring/sections.rs`.
- [ ] `P01.S03` - Wire the new sections module into the authoring module tree; `engine/crates/vaultspec-api/src/authoring/mod.rs`.
- [ ] `P01.S04` - Add validate_section_edit_draft, MaterializedProposalOperation::materialize_section_edit, the carried-through section_edit field (selector plus the captured selected-preimage bytes), and the section-selector OperationError variants, converging on the shared finish_materialization tail like every other operation kind; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [ ] `P01.S05` - Add resolver unit tests: exact anchor match, missing anchor, ambiguous duplicate heading, content-hash mismatch, and a range-hint-drifted-but-anchor-intact case; `engine/crates/vaultspec-api/src/authoring/sections.rs`.
- [ ] `P01.S06` - Add materialize_section_edit unit tests: correct whole-document splice at the resolved range, selected-preimage capture, review-diff shape, and round-trip (de)serialization of the new section_edit field; `engine/crates/vaultspec-api/src/authoring/operations.rs`.
- [ ] `P01.S07` - Run Section selector schema and resolution code review and record the phase audit; `.vault/audit/`.

### Phase `P02` - Apply-side materialization and conflict wiring

Wire SectionEdit into the apply preflight's whole-document write path (reusing SetBody and the ExactBlobHash post-verify exactly like ReplaceBody), and extend conflict detection so a stale section-scoped child reports the finer SectionSelectorUnresolved reason when the drift specifically invalidated the targeted section, falling back to the generic StaleWholeDocumentDraft when the drift lies elsewhere (the ADR's no-section-local-leniency posture: any base drift still blocks apply).

- [ ] `P02.S08` - Admit ChangesetOperationKind::SectionEdit into the apply preflight's supported-operation match, build_write_invocation (SetBody over the spliced target_snapshot.payload_text, identical to ReplaceBody), and post_verify_expectation (ExactBlobHash, since the write is whole-document under the hood); `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [ ] `P02.S09` - Add ConflictKind::SectionSelectorUnresolved and extend is_whole_document_replace to include SectionEdit. In detect_child_base_and_anchor, when a stale SectionEdit child's recorded selector no longer resolves against the current worktree body, report SectionSelectorUnresolved with observed-versus-expected evidence instead of the generic StaleWholeDocumentDraft; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [ ] `P02.S10` - Add live-core apply tests for a SectionEdit changeset over a real temp worktree and core adapter invoke: a clean apply materializes the spliced whole-document body, and an outcome-indeterminate-kill post-verify re-confirms via ExactBlobHash exactly like ReplaceBody; `engine/crates/vaultspec-api/src/authoring/apply.rs`.
- [ ] `P02.S11` - Add conflict-detector tests: a SectionEdit child whose selector still resolves after an out-of-band edit elsewhere in the document reports the generic StaleWholeDocumentDraft (apply still refuses, no section-local leniency), while a child whose targeted section was itself edited or removed reports SectionSelectorUnresolved with the anchor evidence; `engine/crates/vaultspec-api/src/authoring/conflicts.rs`.
- [ ] `P02.S12` - Run Apply-side materialization and conflict wiring code review and record the phase audit; `.vault/audit/`.

### Phase `P03` - Selected-preimage rollback inverse

Extend rollback generation with a SectionEdit inverse that re-resolves the recorded anchor against the current base and splices the captured selected preimage back into the resolved range (never a whole-document preimage restore, which would clobber unrelated sections edited since); admit SectionEdit to the rollback-eligibility matrix gated on a present selected preimage; degrade to the honest rollback_available=false plus manual-repair hook when the section no longer resolves.

- [ ] `P03.S13` - Admit ChangesetOperationKind::SectionEdit to create_rollback_eligibility's invertible-kinds match, gated on the same preimage_available check every other kind shares (the selected preimage, not the whole-document one); `engine/crates/vaultspec-api/src/authoring/transitions.rs`.
- [ ] `P03.S14` - Add the SectionEdit inverse branch in generate_rollback: re-resolve the source child's recorded selector anchor against the current worktree base, splice the captured selected preimage into the resolved range, and materialize via materialize_section_edit against the current base. On a failed re-resolve, return rollback_available=false with the ManualRepairProposal hook, the same honest-degradation shape every other kind uses; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [ ] `P03.S15` - Add rollback tests: a SectionEdit source rolls back by restoring the selected preimage into its resolved range while leaving the rest of the document (including any unrelated concurrent edits) untouched. A source whose targeted section no longer resolves at rollback time is rollback_available=false with a manual-repair hook, and a source with no captured selected preimage is likewise unavailable; `engine/crates/vaultspec-api/src/authoring/rollback.rs`.
- [ ] `P03.S16` - Run Selected-preimage rollback inverse code review and record the phase audit; `.vault/audit/`.

### Phase `P04` - End-to-end verification and campaign closeout

Round out the S243 test matrix at the wire level with a full propose-submit-approve-apply-rollback SectionEdit lifecycle test and its negative paths, run the full lint gate, and check off the delivering rows W13.P45.S242-S244 on the agentic spec-authoring backend plan, mirroring how the ledgered-edit migration closed out agentic P46.

- [ ] `P04.S17` - Add a SectionEdit full-lifecycle HTTP test mirroring exit_gate_flow_issue_create_submit_approve_apply_rollback: propose a section-scoped draft over the wire, submit, approve, apply (confirming the spliced whole-document body landed), and roll back (confirming the selected preimage was restored into its resolved range); `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.
- [ ] `P04.S18` - Add negative-path HTTP tests: a SectionEdit draft whose selector anchor is missing or ambiguous, or whose expected content hash mismatches the current section, is refused at proposal-creation time with the typed evidence. An applied SectionEdit whose section no longer resolves at rollback time surfaces rollback_available=false; `engine/crates/vaultspec-api/tests/authoring_vertical_slices.rs`.
- [ ] `P04.S19` - Run just dev lint all (Rust fmt/clippy plus frontend eslint/prettier/tsc) and confirm exit 0 across every touched crate; `engine/crates/vaultspec-api/`.
- [ ] `P04.S20` - Check off W13.P45.S242, S243, and S244 via vaultspec-core vault plan step check, recording that this plan delivered them (cross-feature, mirroring how the ledgered-edit migration closed out agentic P46); `.vault/plan/2026-06-30-agentic-spec-authoring-backend-plan.md`.
- [ ] `P04.S21` - Run End-to-end verification and campaign closeout code review and record the phase audit; `.vault/audit/`.

## Description

## Steps

## Parallelization

## Verification
