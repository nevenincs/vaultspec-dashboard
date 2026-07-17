---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S12'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Switch the composer comment batch from serialized prompt prose to the structured feedback_batch_id continuation and delete the prose interim outright

## Scope

- `frontend/src/`

## Description

Rag-dedup sweep: grepped every "Comments to address:" / commentBatch consumer (agentComposer, Composer, MarkdownReader, localization) so the deletion is total, and confirmed no existing feedback-batch client method or batch/chip helper to reuse - the chip grammar is reused, the serialization is new-deleted.

- Composer store: make the staged comment batch single-document (a turn carries one feedback_batch_id and the engine batch is single-document) - capture source_document and source_revision (the open document's blob hash) at stage time; a stage from a different document starts a fresh batch (latest-document-wins, visible through the "N comments" chip count). Extend the attachment to carry the anchor byte range.
- Add buildFeedbackBatchRequest mapping a staged batch to the engine create payload; DELETE serializeCommentBatch and AGENT_COMPOSER_COMMENTS_PREFIX and drop the comments arm of buildAgentPrompt (prose interim removed outright, no bridge).
- Add AgentClient.createFeedbackBatch (POST /authoring/v1/feedback-batches, dual-auth command "create_feedback_batch") + useCreateFeedbackBatch; add optional feedback_batch_id to StartTurnPayload.
- Composer.deliverPrompt freezes the batch once the session id is known and threads the returned opaque id onto the turn; a comments-only submit stays valid (the batch is the payload, not the prompt); the queued mid-run path holds the batch and freezes it at dispatch.
- Thread the document node id and blob-hash revision through the reader comment plane so a stage captures a complete anchor.

## Outcome

The composer now speaks the structured feedback continuation end to end and the prose serialization is gone. Frontend typecheck (tsc -b) and eslint pass; the composer store suite (18 tests, structured mapping + single-document reset + comments-only send-enable) and the reworked comment-chip render test pass. One pre-existing mid-run streaming render test flakes identically with these changes stashed (a slow live run-start under the harness, unrelated to this step). Landed frontend-only on dashboard main, staging only the ten S12 files (a concurrent frontend writer holds unrelated uncommitted changes - never swept).

## Notes

Checkbox held OPEN by protocol, like S02: S12's create-batch command hits POST /authoring/v1/feedback-batches, which exists only on the unmerged edge-activation branch, so the batch creation 404s against main's engine until the merge. The end-to-end live-wire proof (create batch -> turn accepted by id; unknown id -> refused) was WRITTEN and PROVEN GREEN against the rebuilt edge binary (create_feedback_batch CommandKind), then parked with the merge-gate set; the offline tests run green on main. Restore the parked test and close this step at the edge-activation merge.

Approved design decisions recorded (team lead confirmed all three): single-document batch (latest-document-wins), source_revision = the open document's blob hash (the D4 staleness fence is a known-unenforced P05 partial), comments-only submit via an empty prompt plus the batch id. No skips introduced. S14 (worker feedback ingest) follows.

Visible-reset requirement (team lead): a document switch that discards a staged batch must not be silent. Covered by today's chip: the composer chip label renders the CURRENT batch's comment count ("N comments"), so a reset re-renders the label to the new document's count (e.g. "30 comments" -> "1 comment") - a visible change, never a silent discard. A stronger affordance (toast) would be a follow-up UX enhancement, not required here.

Create-envelope contract reconciled with executor-core: the create route now validates the envelope command kind (a mismatched-but-valid kind is a typed 422), so the client MUST send exactly "create_feedback_batch" - which AgentClient.createFeedbackBatch does, dual-auth (app bearer + x-authoring-actor-token). The parked live proof exercised this exact envelope green against the edge binary.
