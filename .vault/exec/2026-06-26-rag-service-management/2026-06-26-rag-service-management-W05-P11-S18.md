---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S18'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# File the rag coordination asks for HTTP prune and optimize routes, a contract_version on health, and the server-start idempotency envelope

## Scope

- `engine/crates/rag-client/src/control.rs`

## Description

- Author the mutually-referenced contract + coordination reference `2026-06-26-rag-service-management-reference` capturing: the shared definition of "running" (the §4 predicate), the discovery/`VAULTSPEC_RAG_STATUS_DIR` invariant, the three-tier data contract, and the issue-ready coordination asks to the rag team.
- Draft the four coordination asks (issue-ready bodies): (1) HTTP repair routes (prune/optimize), (2) a `contract_version` on `/health`, (3, optional) `server start --json` idempotency envelope, (4, optional) a STATUS_DIR-independent machine pointer.

## Outcome

Done as drafted. The coordination asks and the mutually-referenced invariant are persisted as a vault reference both repos can cite (the cycle's "written, mutually-referenced invariant" acceptance criterion). Actual filing of the asks as GitHub issues on the vaultspec-rag repo is held pending owner go-ahead - filing to an external tracker is an outward action that should be confirmed, and the asks are explicitly NON-BLOCKING (the dashboard ships self-contained against rag 0.2.25).

## Notes

The asks restate the rag team's own §3/§5/§6 brief items from the dashboard side, so they are ready to paste into rag issues verbatim. The same reference doc should be cross-linked from the rag repo's vault when the asks are filed, completing the two-way reference.
