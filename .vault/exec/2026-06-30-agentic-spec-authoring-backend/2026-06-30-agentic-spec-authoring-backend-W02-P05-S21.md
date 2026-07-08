---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-01'
modified: '2026-07-01'
step_id: 'S21'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Physical store binding and migrations requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Review the W02.P05 plan rows for physical store binding, migrations, schema
  metadata, fail-loud version checks, real store tests, and restart inspection.
- Ground the phase in the authoring state-store ADR requirement that proposals,
  approvals, preimages, apply records, and audit events are product data rather
  than re-derivable cache.
- Ground the phase in the streaming/outbox ADR requirement that later durable
  event records share a transaction boundary with product state.
- Compare existing SQLite patterns in `engine-store` and `vaultspec-session`,
  keeping WAL, busy timeout, and `user_version` precedents while rejecting the
  session store's delete-and-recreate healing policy for authoring state.

## Outcome

The implementation checklist was constrained to the physical SQLite binding,
migration ledger, schema metadata, version checks, and real database tests.
Repository traits, idempotency rows, retention tables, and outbox records remain
later W02 phases.

## Notes

The reviewer later confirmed that the first implementation used the wrong
engine-cache directory; the grounding record now reflects the corrected product
state location requirement.
