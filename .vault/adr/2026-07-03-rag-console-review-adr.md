---
tags:
  - '#adr'
  - '#rag-console-review'
date: '2026-07-03'
modified: '2026-07-17'
related:
  - "[[2026-07-02-rag-console-review-audit]]"
  - "[[2026-07-02-rag-console-review-plan]]"
  - "[[2026-07-03-rag-integration-hardening-research]]"
---

# `rag-console-review` adr: `audit-driven review remediation` | (**status:** `accepted`)

## Problem Statement

This is an audit-first review cycle. The 2026-07-02 rag-console-review audit
(`rag-console-review-audit`) is the originating decision record for all remediation
work in this feature. The audit identified five findings (RCR-001 through RCR-005)
across the RAG operations console and degradation path. This ADR record exists to
satisfy the vaultspec lifecycle requirement for exec record creation; it is not an
independent architecture decision — the audit itself IS the research and the
decision rationale.

## Considerations

All considerations are grounded in the audit. RCR-001 through RCR-005 address
blocking rag I/O on async workers, storage rollup undercounting over a truncated
namespace slice, stale comments/dead whitelist entries, and a permanently-disabled
Evict affordance. RCR-002 and RCR-003 include decision-gated items: a Tier-3
rag coordination ask (RCR-002) and a rule/ADR curation decision (RCR-003).

## Considered options

- **Directly implement all findings (chosen).** P01 remediates RCR-001, -002
  (implementable half), -004, and -005 directly. P02 closes the decision-gated
  RCR-002 (Tier-3 coordination ask) and RCR-003 (curation). No alternative was
  considered — the findings are unambiguous and the fixes are well-scoped.

## Constraints

All parent seams audited as sound. No frontier risk. The Tier-3 ask (P02.S05)
is non-blocking: the dashboard ships self-contained regardless of whether rag
ever implements the requested aggregate totals or the collection-name descriptor.

## Implementation

P01 (four steps): spawn_blocking wraps for brokered rag HTTP reads; StorageRollup
truncation flag + console annotation; stale `--json` comment fix + dead whitelist
row removal; Evict stated-reason. P02 (two steps): file the Tier-3 coordination
ask for machine-wide storage totals and vault collection name; curation decision on
the blake2b rule/ADR contradiction.

## Rationale

The audit findings are read-only architecture review results with clear, bounded
fixes. Each finding names the affected seam and either a directly implementable fix
or a decision-gated action. The P01 fixes were executed as the rag-integration-hardening
cycle's ride-along items and as standalone improvements to the ops console correctness.
The P02 items close the decision-gated residuals.

## Consequences

- RCR-001 through RCR-005 remediated or formally closed.
- The rag-console-review plan is fully closed.
- The Tier-3 coordination ask is on record for the rag team to act when ready.
- The blake2b rule/ADR curation is reconciled.
