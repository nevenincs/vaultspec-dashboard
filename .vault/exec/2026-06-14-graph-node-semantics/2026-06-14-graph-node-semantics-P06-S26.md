---
tags:
  - '#exec'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:f2fa8538dc8f416b8e3a77c59fc495d41f5356c7624668368696ee1cccdc8309'
step_id: 'S26'
related:
  - "[[2026-06-14-graph-node-semantics-plan]]"
---

# feed a captured live sample through the client path and assert the fields

## Scope

- `frontend/src/stores/server/liveAdapters.test.ts`

## Description

## Outcome

Added a captured-live-sample conformance test feeding a document slice with the ontology fields through adaptGraphSlice, asserting authority_class/aggregate/derivation survive the client path.

{OUTLINE}

## Notes
