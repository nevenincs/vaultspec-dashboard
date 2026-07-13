---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Enforce machine-global discovery precedence with no STATUS_DIR override and add a guard test

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Reorder `service_json_candidates` so the machine-global `~/.vaultspec-rag/service.json` is the FIRST (winning) candidate and the per-scope path is only a fallback behind it (was: per-scope first).
- Document the discovery invariant in the function: rag is one service per machine; the dashboard never overrides `VAULTSPEC_RAG_STATUS_DIR`; if per-scope isolation is ever needed, switch to a STATUS_DIR-independent machine pointer coordinated with rag first.
- Add two guard tests: `discovery_lists_the_machine_global_home_candidate_first` (the home candidate precedes the per-scope one) and `machine_global_service_json_wins_over_a_per_scope_one` (with both fresh, the machine-global port is discovered).

## Outcome

Done. A stale or forward-compatible per-scope `service.json` can no longer shadow the live machine service. `cargo test -p rag-client --lib client::` is green (15 passed, incl. the 2 new guards).

## Notes

The "no STATUS_DIR override" half of the invariant is enforced structurally (the engine sets it nowhere - grep-confirmed) and by the documented comment; it is promoted to a build-gated project rule in W05 (`dashboard-does-not-override-rag-status-dir`). A unit test asserting global env-var absence would be racy under parallel tests, so the precedence (the testable half) is guarded here and the prohibition is codified as a rule.
