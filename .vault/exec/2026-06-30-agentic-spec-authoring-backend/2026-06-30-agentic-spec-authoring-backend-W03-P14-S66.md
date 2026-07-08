---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S66'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Validation digest and stale-input detection requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground W03.P14 against the rewritten rollout reference, plan rows, and accepted authoring ADRs.
- Bind validation to the Increment 1 whole-document proposal material produced by W03.P13.
- Identify existing code surfaces for base revision checks, target snapshots, review material, and core-frontmatter validation forwarding.
- Separate validation digest production from later approval, transition, apply, route, stream, and ledger persistence phases.
- Mark stale chunk checks as metadata-only or unavailable in Increment 1 because the chunk API is deferred.

## Outcome

- W03.P14 must produce backend-owned validation status material for proposal operations: a stable digest over reviewed material, base revisions, target snapshot hashes, operation kinds, and validation findings.
- W03.P14 must detect changed base revisions before a proposal is considered approval-ready and must record blocking errors for stale bases and invalid metadata.
- W03.P14 must support warning-only status separately from blocking failures so later review gates can distinguish `valid_with_warnings` from invalid proposals.
- W03.P14 must not create approval records, apply jobs, route handlers, streams, LangGraph tool aliases, section selectors, chunk APIs, or ledger lifecycle transitions.
- Stale approvals are a consumer of validation digests in W05.P23 and apply phases; this phase records the digest inputs that approvals later bind to.
- Changed chunks cannot be a hard V1 requirement because W03.P12 chunk APIs are explicitly deferred. Validation should carry optional chunk evidence status and make missing chunk evidence explicit rather than failing the whole-document skeleton.

## Notes

- Existing useful surfaces include `TargetSnapshot`, `RevisionSnapshot`, `MaterializedProposalOperation`, `ReviewDiffProjection`, and the `/ops/core` frontmatter/conformance adapter as an internal validation analogue.
- The public authoring API must remain semantic; W03.P14 may define validation records and digests but must not expose `vaultspec-core` command shapes.
- No destructive git operation was used.
