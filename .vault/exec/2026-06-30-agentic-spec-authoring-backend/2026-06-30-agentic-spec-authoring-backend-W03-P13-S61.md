---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S61'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Proposal operation payloads and previews requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground the phase against the rewritten rollout reference, the W03.P13 phase title, and the accepted authoring ADRs.
- Treat the W03.P13 phase description as binding over stale row phrases that still mention atomic patches, atomic hunks, invalid ranges, or staged apply.
- Bind the implementation checklist to the Increment 1 walking skeleton: one single-child existing-document body-edit proposal with a materialized preview and reviewable diff.
- Defer section-scoped operations, atomic hunks, selector validation, selected preimages, invalid range cases, chunks-as-required-input, sessions, streams, LangGraph, and multi-agent composition to their later phases.
- Keep the public shape semantic and child-operation based so the ledger and DTO contract can remain multi-child even while V1 apply is single-child.

## Outcome

- W03.P13 must implement whole-document operation materialization for existing `replace_body` drafts first.
- A materialized proposal operation must carry the reviewed document reference, operation kind, base revision fence, full target snapshot, review diff projection, and rollback/preimage linkage where available.
- Review diffs are derived artifacts for human and agent inspection; they are not apply authority and they are not rollback authority.
- Apply, lifecycle persistence, approval decisions, validation digests, rollback commands, route handlers, streams, and LangGraph tools remain outside this phase.
- Create/delete wording in older row text is not part of the Increment 1 demo unless represented only as rejected or unsupported operation cases; the skeleton target is an existing-document body replacement.
- Section and atomic-hunk wording in S62 and S63 is superseded by W13.P45 for this rollout.

## Notes

- The Rust DTO layer already has `ChangesetChildOperationDraft`, `ChangesetOperationKind::ReplaceBody`, `TargetRevisionFence`, and `DraftMode::WholeDocument`; W03.P13 should build the domain projection rather than replacing those DTOs.
- `TargetSnapshot` and `PreimageRecord` from W03.P11 are the inputs for target materialization and recovery integrity.
- No destructive git operation was used.
