---
tags:
  - '#audit'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# `a2a-orchestration-edge` audit: `active-run reload recovery`

## Scope

The dashboard engine pass-through, frontend reload binding, scope provenance,
contract adapters, cache lifecycle, and real-behavior coverage were reviewed
against D1, D3, and D5 after implementation. Validation failures outside the
change set are classified here so the rolling audit remains open and truthful.

## Findings

### missing-workspace-provenance | high | Dashboard-started runs were not discoverable

Resolved. `run-start` injects the engine-controlled canonical workspace
selector into durable A2A metadata, and discovery supplies the same selector.

### discovery-contract-drift | high | Malformed envelopes could restore a binding

Resolved. Recovery rejects version, state, completeness, refusal, row, bound,
status-vocabulary, canonical-tier, and present-agent-tier drift. Only the six
upstream active statuses are accepted.

### cross-scope-binding | high | A stale run could render after a workspace switch

Resolved. Every non-null binding requires scope provenance, render-time access
uses `scopedTeamRunId`, and unknown or mismatched provenance clears rather than
being inferred.

### scope-token-fence | high | Windows path spelling could reject a valid fence

Resolved. `expected_scope` is compared with the canonical `scope_token`, which
also supplies the durable discovery selector. A Windows extended-path
regression covers the served spelling.

### discovery-cache-resurrection | high | Cached data could rebind a dismissed run

Resolved. Successful discovery is consumed after binding, and recovery is a
conditionally mounted query with `refetchOnMount: "always"`, so every
reactivation performs a fresh bounded read.

### unscoped-binding | medium | Unknown provenance was stamped onto the current scope

Resolved. `teamRunScopeAction` clears an unscoped binding and the non-null
setter type requires a scope.

### component-lifecycle-coverage | medium | Recovery transitions lacked direct coverage

Resolved. The live render suite covers cross-scope clearing, consumed recovery,
dismissal, and close/reopen refetch behavior without wire doubles.

### rust-locale-conformance | medium | Unrelated Rust conformance assertion is red

Open baseline queue item. Two attempts at the locale conformance case returned
`["en"]` where the existing assertion expects `["system", "en"]`. Focused A2A
tests and Clippy pass; this implementation does not alter localization.

### frontend-suite-budget | medium | Full frontend run exceeded 15 minutes

Open baseline queue item. The repository-wide command exceeded its execution
budget while the live harness remained active. The relevant 36-test slice,
TypeScript, Prettier, and ESLint pass. The harness also emits existing
shutdown-time socket reset diagnostics.

### execution-record-hygiene | low | Records retained template annotations

Resolved. Template-only annotations were removed and outcomes were updated with
the actual verification evidence.

## Recommendations

- Keep the locale conformance and long-running frontend harness findings in the
  rolling audit queue until their owning work resolves them.
- Preserve the reviewed whitelist, selector, status, tier, and two-row bounds as
  contract events rather than incidental refactors.
