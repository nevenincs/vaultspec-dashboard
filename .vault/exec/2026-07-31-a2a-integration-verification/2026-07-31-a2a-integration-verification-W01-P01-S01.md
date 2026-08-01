---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:b668e1943b1cca9751e0817e6a6a472026d9455ffc4d20f1ee9c47d7d5a62b18'
step_id: 'S01'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---

# Record the completed instrumentation finding as the phase's grounding: a real-worker dispatch logged a chat model at the inbound point and at every wrapping seam that ran, and an AST sweep found only two tuple-returning resolvers, both correctly annotated and correctly unpacked at every call site, so no seam yields a tuple

## Scope

- `src/vaultspec_a2a/graph/nodes/worker.py`

## Description

- Preserve the plan's completed real-worker dispatch observation: the inbound
  model and every model-wrapping seam exercised by that dispatch logged a
  chat-model object, never the resolver tuple.
- Ground the repeatable source evidence at A2A revision `d35ae1024576f7bc429e71348a6edf8a9418481a`.
  Run `uvx vaultspec-rag search` for the model-resolution path against the indexed
  A2A root, then confirm the result in the isolated branch with exact `rg` symbol
  searches and a Python AST sweep over `src/vaultspec_a2a`.
- Read `src/vaultspec_a2a/graph/nodes/worker.py` whole and trace the invocation
  value through `_resolve_effective_worker_model`, `_attach_authoring_tools`, the
  MCP composition seams, and the final `effective_model.ainvoke` call.
- Confirm that `_resolve_model_for_worker` and `_resolve_supervisor_model` are
  the two model-producing tuple resolvers: both annotate their first element as
  `BaseChatModel`, and every production call site unpacks that element before it
  reaches a worker or supervisor node.

## Outcome

The historical runtime observation recorded by the plan and the independently
repeatable source inspection agree: the model entering the real worker and
surviving each exercised wrapping seam is a chat model. The tuple belongs only
to compiler resolution metadata transport, and all production consumers unpack
its model element. There is no current model-resolution seam to repair in
`src/vaultspec_a2a/graph/nodes/worker.py`.

## Notes

This Step records grounding only. It does not claim that a permanent completion
test exists, choose that test's model substrate, or close the regression lock
assigned to later Steps. The first semantic search from the isolated A2A branch
reported no indexed code items; the read-only search was repeated from the
indexed A2A main root, then every cited symbol was confirmed in the isolated
branch. The temporary runtime instrumentation output is not retained in either
checkout, so this record preserves the plan's historical observation but does
not present a repository log as independently re-runnable evidence. The initial
scaffold command timed out after creating this record; no partial extra artifact
was left behind.
