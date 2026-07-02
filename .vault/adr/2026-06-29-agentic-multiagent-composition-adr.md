---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-06-29'
modified: '2026-06-30'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-06-29-langgraph-approval-document-editing-research]]"
  - "[[2026-06-29-zed-acp-document-authoring-research]]"
  - "[[2026-06-29-agentic-authoring-boundary-adr]]"
  - "[[2026-06-29-agentic-changeset-ledger-adr]]"
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-multiagent-composition` adr: `parallel agent work units and composition rules` | (**status:** `proposed`)

## Problem Statement

DEMOTED accepted → proposed on 2026-07-02 (architecture review finding ASA-003):
this decision models parallel agent work units, a six-value composition
projection, and composed-candidate generation ahead of any single-agent path
existing. V1's concurrency requirement — concurrent proposals are allowed, apply
serializes on base-revision checks, overlap becomes `conflicted` — is fully
covered by the accepted concurrency-leases-conflicts ADR. The design below is
retained as the candidate shape and returns to acceptance when the walking
skeleton produces multi-agent evidence (two real agents whose work must compose);
nothing here is load-bearing until then, and no implementation phase should
build against it while proposed.

The brief requires multiple concurrent agents and humans authoring, tweaking,
rewriting, and proposing document changes. The existing ledger permits concurrent
proposals, but the corpus needs a composition model for parallel work units,
overlap detection, competing candidates, and safe merge into review.

## Considerations

Parallel agents may work under one authoring session or separate sessions. Some
work is naturally disjoint, such as different documents or sections; other work
overlaps semantically even if text ranges differ. Reviewers need to see whether
proposals compose, compete, supersede, or conflict before apply. Automatic merge
of agent proposals is risky unless the backend can prove scopes are disjoint and
validation still passes.

## Constraints

No agent work unit may write canonical documents directly. Composition decisions
must be backend-served, not inferred by the frontend. Disjointness must be proven
against explicit target scopes and base revisions. Human approval of one
candidate must not silently approve later composed or rebased material.

## Implementation

The authoring backend models `agent_work_unit` records under an
`authoring_session`. A work unit carries actor, parent session, optional parent
changeset, target documents, target sections or semantic scopes, base revisions,
LangGraph run references, status, and output proposal ids.

Work units can produce separate changesets or child operations in one changeset.
The backend computes a composition projection: `disjoint`, `overlapping`,
`competing`, `superseding`, `depends_on`, or `blocked`. Disjoint operations may
be bundled into a composed review candidate only when base revisions match,
target scopes do not overlap, validation passes on the composed target, and
policy allows composition. Overlapping or competing proposals remain separate
review candidates and require reviewer choice, rebase, or explicit supersession.

Composed candidates are new proposal revisions with their own approval
requirements. Prior approvals on source proposals do not transfer unless the
policy explicitly says the composed material is unchanged and still bound to the
same reviewed revision set.

## Rationale

This gives the system parallelism without pretending concurrent agent output is
automatically mergeable. It also gives reviewers a useful decision surface:
compare candidates, accept disjoint composition, request rework, or supersede
work explicitly.

## Consequences

The backend needs target-scope metadata and overlap checks for every work unit.
Agents gain freedom to work in parallel, but composition becomes a product
workflow, not a hidden merge. The main cost is that reviewers may see more
competing candidates when scopes are ambiguous.

## Codification candidates

- **Rule slug:** `parallel-agent-work-composes-only-by-proven-scope`.
  **Rule:** Parallel agent outputs may be composed into one review candidate only
  when backend target-scope analysis proves disjointness, base compatibility, and
  validation success.
- **Rule slug:** `composed-proposals-require-fresh-approval`.
  **Rule:** A composed or rebased agent proposal is a new reviewable proposal
  revision and cannot inherit approval unless policy proves the reviewed material
  and base revision set are unchanged.
