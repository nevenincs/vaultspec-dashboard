---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S14'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Ingest the retrieved feedback batch in the a2a worker flow: a feedback-aware step that reads the batch via the authoring client when feedback_batch_id is present in graph state and grounds the document revision on it, compiled into the worker graph, with live tests, in the vaultspec-a2a repository

## Scope

- `src/vaultspec_a2a/graph/`
- `src/vaultspec_a2a/worker/`

## Description

Rag-dedup sweep (vaultspec-rag, --type code only:prod) surfaced the mount-node grounding pattern (transient mounted_context assembled before the writer, cleared after) as the closest analogue.

- Land the retrieval half: FeedbackContextReader reads a run's engine feedback batch by id via the bearer + actor-token read route (AuthoringClient.get_feedback_batch), mirroring the document submitter's engine + token-store construction (engine_bearer + a role actor token). render_feedback_batch is a pure transform from the served batch to grounding text (the whole-batch instruction plus one anchored line per comment). Retrieval is best-effort - an unreachable engine, missing credential, or unknown id degrades to no grounding rather than failing the turn.
- Unit-test the renderer directly (heading anchor, instruction, bare body, skipped empties, malformed to None).

## Outcome

The retrieval and rendering half landed on vaultspec-a2a main and is verified (ruff + ty clean; 5 renderer unit tests plus the authoring suite green). A run can now retrieve its authoritative feedback context by id, read-path-only, without owning the content.

## Notes

CHECKPOINT (graph-compilation touch grew beyond a clean single seam, flagged per the S14 instruction). The grounding INJECTION site is not the mount node. mounted_context is consumed only by the worker node (star / pipeline / pipeline_loop coder topologies via create_mount_node); the research_adr topology - the document-authoring flow that actually consumes feedback batches on a revision run - does NOT wire the mount node. Its writers are produced by _make_research_producer and the synthesist / adr-author nodes, which assemble their own SystemMessage context. So wiring feedback into the mount node would ground the wrong (non-document) topologies (speculative), and was reverted.

The remaining, correct injection: thread a FeedbackContextReader into _compile_research_adr and inject a feedback grounding SystemMessage into the research_adr writer producers (researcher / synthesist / adr-author) when feedback_batch_id is present in state, built in graph_lifecycle from resolve_engine + the run token store (mirroring _build_proposal_submitter). This is a multi-node producer injection across the research_adr graph - sized as its own focused piece rather than rushed at the tail of a long session. Live tests (a revision run grounded on a real batch) are merge-gate parked (the get_feedback_batch route is edge-only). Checkbox held OPEN pending the research_adr injection and its live proof. No skips introduced; the retrieval core is fully landed and reusable by that injection.
