---
generated: true
tags:
  - '#index'
  - '#agentic-spec-authoring-backend'
date: '2026-08-01'
modified: '2026-09-19'
body_schema: 'body-v2'
body_hash: 'sha256:04c0de769a3800926b12eb46d15e7162b3dfc503462783a689968c1c5c89ec17'
related:
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-spec-authoring-backend-research]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W02-P09-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P10-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P11-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P13-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P14-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P15-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P16-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P17-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W03-P19-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W10-P21-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W10-P48-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W10-P49-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W11-P33-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W11-P34-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-W11-P50-summary]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-audit]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-ledger]]'
  - '[[2026-06-30-agentic-spec-authoring-backend-plan]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
  - '[[2026-07-02-agentic-spec-authoring-backend-audit]]'
  - '[[2026-07-02-agentic-spec-authoring-backend-reference]]'
  - '[[2026-07-06-agentic-spec-authoring-backend-audit]]'
  - '[[2026-07-07-agentic-spec-authoring-backend-audit]]'
  - '[[2026-07-09-agentic-spec-authoring-backend-audit]]'
  - '[[2026-07-10-agentic-spec-authoring-backend-audit]]'
  - '[[2026-07-11-agentic-spec-authoring-backend-adr]]'
---

# `agentic-spec-authoring-backend` feature index

Auto-generated index of all documents tagged with `#agentic-spec-authoring-backend`.

## Documents

### adr

- `2026-06-29-agentic-apply-materialization-adr` - `agentic-apply-materialization` adr: `approved changesets materialize through the core adapter` | (**status:** `accepted`)
- `2026-06-29-agentic-approval-gates-review-state-adr` - `agentic-approval-gates-review-state` adr: `backend-owned approval gates and review state` | (**status:** `accepted`)
- `2026-06-29-agentic-authoring-api-contract-adr` - `agentic-authoring-api-contract` adr: `V1 authoring API and endpoint contract` | (**status:** `accepted`)
- `2026-06-29-agentic-authoring-boundary-adr` - `agentic-authoring-boundary` adr: `Rust-owned authoring API with internal core adapter` | (**status:** `accepted`)
- `2026-06-29-agentic-authoring-state-store-adr` - `agentic-authoring-state-store` adr: `durable authoring state store` | (**status:** `accepted`)
- `2026-06-29-agentic-change-format-and-chunking-adr` - `agentic-change-format-and-chunking` adr: `hybrid proposal changes with section-scoped snapshots` | (**status:** `accepted`)
- `2026-06-29-agentic-changeset-ledger-adr` - `agentic-changeset-ledger` adr: `changeset identity, lifecycle, projections, and idempotency` | (**status:** `accepted`)
- `2026-06-29-agentic-concurrency-leases-conflicts-adr` - `agentic-concurrency-leases-conflicts` adr: `revision-first concurrency with advisory leases` | (**status:** `accepted`)
- `2026-06-29-agentic-document-chunk-management-adr` - `agentic-document-chunk-management` adr: `revision scoped document chunk management` | (**status:** `superseded`)
- `2026-06-29-agentic-document-identity-adr` - `agentic-document-identity` adr: `document identity and provisional targets` | (**status:** `accepted`)
- `2026-06-29-agentic-langgraph-integration-adr` - `agentic-langgraph-integration` adr: `threads, runs, checkpoints, interrupts, and tool calls` | (**status:** `accepted`)
- `2026-06-29-agentic-live-editing-room-adr` - `agentic-live-editing-room` adr: `defer CRDT and OT to a scoped editing-room substrate` | (**status:** `accepted`)
- `2026-06-29-agentic-multiagent-composition-adr` - `agentic-multiagent-composition` adr: `parallel agent work units and composition rules` | (**status:** `proposed`)
- `2026-06-29-agentic-review-station-state-adr` - `agentic-review-station-state` adr: `review station queue state and assignment model` | (**status:** `accepted`)
- `2026-06-29-agentic-rollback-history-adr` - `agentic-rollback-history` adr: `rollback as a new auditable changeset` | (**status:** `accepted`)
- `2026-06-29-agentic-security-provenance-adr` - `agentic-security-provenance` adr: `actor permissions and auditable agent provenance` | (**status:** `accepted`)
- `2026-06-29-agentic-streaming-events-outbox-adr` - `agentic-streaming-events-outbox` adr: `durable authoring events and replayable streams` | (**status:** `accepted`)
- `2026-07-02-agentic-operation-modes-adr` - `agentic-operation-modes` adr: `authoring operation modes and the unified write path` | (**status:** `accepted`)
- `2026-07-11-agentic-spec-authoring-backend-adr` - `agentic-spec-authoring-backend` adr: `Defer section-scoped operations and the CreateDocument delete-inverse until their gates clear` | (**status:** `accepted`)

### audit

- `2026-06-30-agentic-spec-authoring-backend-audit` - `agentic-spec-authoring-backend` audit: `W01 P01 authoring route shell review`
- `2026-07-02-agentic-spec-authoring-backend-audit` - `agentic-spec-authoring-backend` audit: `architecture review toward hardened superseding ADRs`
- `2026-07-06-agentic-spec-authoring-backend-audit` - `agentic-spec-authoring-backend` audit: `W10 P21 approval policy matrix review`
- `2026-07-07-agentic-spec-authoring-backend-audit` - `agentic-spec-authoring-backend` audit: `semantic-agent-tool-aliases`
- `2026-07-09-agentic-spec-authoring-backend-audit` - `agentic-spec-authoring-backend` audit: `W12-W14 engine wiring verification and Increment 5-6 phase review closure`
- `2026-07-10-agentic-spec-authoring-backend-audit` - `agentic-spec-authoring-backend` audit: `W13.P46 per-operation rollback inverses — return trigger fired and satisfied`

### exec

- `2026-06-30-agentic-spec-authoring-backend-ledger` - `agentic-spec-authoring-backend` ledger
- `2026-06-30-agentic-spec-authoring-backend-W02-P09-summary` - `agentic-spec-authoring-backend` `W02.P09` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P10-summary` - `agentic-spec-authoring-backend` `W03.P10` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P11-summary` - `agentic-spec-authoring-backend` `W03.P11` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P13-summary` - `agentic-spec-authoring-backend` `W03.P13` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P14-summary` - `agentic-spec-authoring-backend` `W03.P14` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P15-summary` - `agentic-spec-authoring-backend` `W03.P15` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P16-summary` - `agentic-spec-authoring-backend` `W03.P16` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P17-summary` - `agentic-spec-authoring-backend` `W03.P17` summary
- `2026-06-30-agentic-spec-authoring-backend-W03-P19-summary` - `agentic-spec-authoring-backend` `W03.P19` summary
- `2026-06-30-agentic-spec-authoring-backend-W10-P21-summary` - `agentic-spec-authoring-backend` `W10.P21` summary
- `2026-06-30-agentic-spec-authoring-backend-W10-P48-summary` - `agentic-spec-authoring-backend` `W10.P48` summary
- `2026-06-30-agentic-spec-authoring-backend-W10-P49-summary` - `agentic-spec-authoring-backend` `W10.P49` summary
- `2026-06-30-agentic-spec-authoring-backend-W11-P33-summary` - `agentic-spec-authoring-backend` `W11.P33` summary
- `2026-06-30-agentic-spec-authoring-backend-W11-P34-summary` - `agentic-spec-authoring-backend` `W11.P34` summary
- `2026-06-30-agentic-spec-authoring-backend-W11-P50-summary` - `agentic-spec-authoring-backend` `W11.P50` summary

### plan

- `2026-06-30-agentic-spec-authoring-backend-plan` - `agentic-spec-authoring-backend` plan

### reference

- `2026-07-02-agentic-spec-authoring-backend-reference` - `agentic-spec-authoring-backend` reference: `walking-skeleton rollout order and schedule`

### research

- `2026-06-29-agentic-spec-authoring-backend-research` - `agentic-spec-authoring-backend` research: `approval-driven collaborative document authoring backend`
