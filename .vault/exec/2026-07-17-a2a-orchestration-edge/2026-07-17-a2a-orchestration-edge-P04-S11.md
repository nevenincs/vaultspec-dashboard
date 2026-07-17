---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S11'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Thread feedback_batch_id through a2a run-start and turn dispatch as an opaque identifier whose authoritative context is retrieved via the engine authoring client, in the vaultspec-a2a repository

## Scope

- `src/vaultspec_a2a/`

## Description

Rag-dedup sweep (vaultspec-rag, --type code only:prod) found no prior feedback/comment/revision path in the a2a repo; feature_tag is the sole opaque-identifier carrier analogue, so the carrier mirrors it exactly.

- Scope 1 (carrier): add optional opaque feedback_batch_id to the v1 RunStartRequest, fold it onto the run ThreadMetadata in the gateway endpoint (mirroring feature_tag), add it to ThreadMetadata (persisted for restart), read it into DispatchRequest in thread_service, add the DispatchRequest field, add a TeamState channel, and pass it into graph_input on first ingest guarded like active_feature.
- Scope 2 (read): add AuthoringClient.get_feedback_batch(batch_id) hitting GET /authoring/v1/feedback-batches/{batch_id}, bearer-only capability-by-id, unknown id to a typed 404, returned batch treated as opaque grounding context.
- Add live carrier tests proving run-start threads the id verbatim to the worker dispatch and dispatches null when absent, plus build_graph_input unit coverage for the worker end.

## Outcome

Scope 1 and 2 landed on vaultspec-a2a main and verified: the opaque feedback_batch_id now flows run-start to worker graph state (never parsed by a2a, edge ADR D5), and the worker can retrieve the authoritative batch through the engine read route. ruff and ty clean on all touched modules; 83 tests pass across the gateway/worker/metadata/authoring suites (the lone failure is the pre-existing environment-dependent zai presets test, reproducing on clean HEAD). The client method contract was verified against the edge-activation branch source; the engine's own GET-route doc states the worker's feedback consumption is read-path-only, independently confirming the design.

## Notes

Scope 3 (worker retrieval wired into a revision node) is DEFERRED with team-lead pre-authorization. The a2a worker has no revision node that ingests external feedback: it revises on document-conformance errors and submits proposals directly (authoring/submitter.py), and never starts an engine prompt turn. Wiring the async batch retrieval plus a feedback-injecting writer step is a real feature touching graph compilation and the writer nodes, disproportionate to this row. Placement (its own step vs a later revision-flow piece) is pending the team lead. No skips introduced.

The get_feedback_batch live round-trip test (create a batch, read it back through the client) needs the edge-activation engine binary and is parked with the merge-gate set; the committed carrier tests run green on main's engine. Checkbox held OPEN pending the scope-3 placement decision and the merge-gate live assertions.
