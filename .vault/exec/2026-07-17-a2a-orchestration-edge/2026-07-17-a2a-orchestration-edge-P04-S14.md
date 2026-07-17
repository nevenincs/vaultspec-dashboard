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

The end-to-end grounded-revision boundary proof (a live research_adr revision that hands the writer model the reviewer feedback) is a live test owed at the reconciliation gate. Per the 2026-07-17 reconciliation, dashboard main independently adopted the engine batch routes (get_feedback_batch et al.), so this and the other parked proofs (S02, S11, S12) re-run against MAIN's binary rather than the retired edge-activation branch. Checkbox held OPEN pending that live grounded-revision proof; the injection itself is code-complete and offline-proven. No skips introduced.
