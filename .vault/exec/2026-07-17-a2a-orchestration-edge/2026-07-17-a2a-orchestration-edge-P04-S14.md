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

- Retrieval half: FeedbackContextReader reads a run's engine feedback batch by id via the bearer + actor-token read route (AuthoringClient.get_feedback_batch), mirroring the document submitter's engine + token-store construction. render_feedback_batch is a pure transform from the served batch to grounding text (the whole-batch instruction plus one anchored line per comment). Best-effort: an unreachable engine, missing credential, or unknown id degrades to no grounding rather than failing the turn.
- Injection: thread an optional feedback_reader through compile_team_graph into _compile_research_adr and onto the two document WRITER worker nodes only (synthesist, adr-author) - never the reviewers, never the diverge researcher. The worker node retrieves the batch when feedback_batch_id is in state and passes the rendered grounding to _build_worker_messages, which appends it as a labelled "Reviewer feedback to address" SystemMessage after the mounted corpus. Absent reader or id = no block, zero behaviour change.
- Build the reader in graph_lifecycle beside the proposal submitter (best-effort, not fail-closed: a run without a reachable engine grounds nothing), presenting the synthesist role's actor token for the capability-by-id read.
- Unit-test the renderer directly, and the message injection both arms (present -> one labelled block containing the grounding; absent/empty -> no block).

## Outcome

S14 landed complete on vaultspec-a2a main: a research_adr revision run now retrieves the reviewer's authoritative feedback by id and grounds the document writers on it, read-path-only, never owning the content. Verified: ruff + ty clean on every touched module; 42 graph tests (worker + compiler, including the 2 new injection tests and unchanged research_adr compilation) and 27 executor tests green, plus the 5 renderer unit tests. The grounding was deliberately NOT wired into the mount node - mounted_context serves only the coder topologies, which never consume a batch - so the injection targets the document writers directly.

## Notes

RESOLVED at the reconciliation gate. The end-to-end grounded-revision boundary proof landed and is GREEN against MAIN's engine binary: test_feedback_grounding_live.py spawns a real batch on the engine, retrieves it through a real FeedbackContextReader under a real minted synthesist token, and asserts the actual synthesist worker node hands its (recording) model the "Reviewer feedback to address" SystemMessage carrying the batch comments - and no block when no feedback_batch_id is in state.

Reconciliation finding worth recording: main's feedback-batch READ route serves the batch NESTED under a "batch" key with the id named feedback_batch_id, while CREATE returns a flat batch_id. render_feedback_batch was hardened to unwrap data.batch (tolerant of both), and the S11 read round-trip likewise landed green against main. Reported to executor-core (engine owner) as a possible create-vs-read inconsistency; the a2a consumer is robust regardless. Step closed as delivered. No skips.
