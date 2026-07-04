---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S11'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Command vocabulary and aggregate identifiers requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground the phase against accepted authoring API, document identity, changeset
  ledger, approval, apply, provenance, and LangGraph ADRs.
- Confirm the phase should define semantic backend vocabulary only, not handlers,
  stores, core adapters, or transport endpoints.
- Identify required aggregate and reference vocabulary: actor, changeset,
  session, run, proposal, approval, lease, receipt, idempotency, revision,
  tool-call, interrupt, and LangGraph references.

## Outcome

W01.P03 requirements were grounded before implementation. The model scope was
kept to authoring-domain vocabulary and status prechecks, with core-specific
verbs excluded from the public command surface.

## Notes

`vaultspec-rag` was unavailable, so grounding used direct ADR reads and targeted
source search per the fallback path allowed by the execution skill.
