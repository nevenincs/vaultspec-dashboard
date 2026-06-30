---
tags:
  - '#audit'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# `rag-service-management` audit: `review and live verification against rag 0.2.25`

## Scope

The W05 review (S20) of the whole `rag-service-management` campaign (engine rag-client +
vaultspec-api, stores, and the console), the deferred-item completion that followed, and the
LIVE verification of the backend against the running rag `0.2.25` service (pid 46676, port
8766, `qdrant.mode: local`) after the worktree venv was swapped to the published baseline.

## Findings

Adversarial code review verdict: **PASS-WITH-REVISIONS** (1 HIGH, 3 MEDIUM, 4 LOW; no
CRITICAL). The central D1 invariant (never 502 an already-running start; attach instead) and
the hot-path / engine-read-and-infer / bounded / injection / stable-selectors / no-px
disciplines were all confirmed clean.

- **HIGH (rag-start-readiness):** a single 1.5s post-start `/health` re-probe would misreport
  a slow cold start (GPU model load) as failed. RESOLVED: trust `exit 0` as authoritative
  "started" (rag exits non-zero only on a real failure), harvest pid/port best-effort; on a
  non-zero exit use a bounded settle re-probe (`reprobe_rag_until_running`).
- **MEDIUM (lifecycle-stderr):** the capture runner drained only stdout. RESOLVED: drains
  stdout AND stderr concurrently (bounded), and the needs-install heuristic + surfaced output
  scan the combined text (rag prints the install hint to stderr).
- **MEDIUM (console-intent-gap):** RESOLVED — `needs_install` added to `RagStartStatus`; the
  console surfaces the start outcome and offers an auto-provision retry; Restart/Doctor/Install
  affordances + the bounded start-arg pass-through (`local_only`/`port`/`qdrant_auto_provision`)
  are now wired end-to-end.
- **MEDIUM (action-descriptor):** ACCEPTED DEVIATION — the lifecycle verbs route the action
  plane via the `dispatchOps` seam (logged/guardable), consistent with the sibling rag data
  verbs; full keymap/palette enrollment of the new buttons is a future enhancement.
- **LOW (crashed-absent-strings):** RESOLVED — replaced the reason-substring match with a
  typed `DiscoveryOutcome` (Fresh/Stale/Malformed/Absent); the crashed path now also carries
  the discovered info.
- **LOW (collection-health local mode):** RESOLVED (surfaced by live testing) — added
  `QdrantHealth::http_reachable`; collection-health returns an honest `supported:false` with a
  clear reason in local-only mode rather than degrading on a connection refusal.
- **LOW (dead rag.reason):** RESOLVED — `deriveRagStatusView` now falls back to the lifecycle
  `rag.reason` when the tier block names none.
- **LOW (amber crashed dot):** RESOLVED — the console dot is green/amber/broken for
  running/crashed/absent.
- **LOW (async-blocking probe):** ACCEPTED RESIDUAL — `probe_machine_state` does bounded
  (1.5s) blocking I/O in async handlers; on the multi-threaded runtime the worker-occupancy is
  negligible, and refactoring all call sites with `spawn_blocking` was judged higher-risk to
  the just-live-validated path than the LOW benefit warrants. Documented for a future pass.

## Live verification (against rag 0.2.25, non-destructive)

The venv was swapped to `vaultspec-rag 0.2.25` + `vaultspec-core 0.1.34` by stopping only the
5 dashboard-venv `vaultspec-search-mcp.exe` MCP CLIENTS (the rag SERVICE pid 46676 left
running). A throwaway engine built from this branch was served on port 8769 and exercised:

- `/status` rag block = `{available:true, pid:46676, port:8766, state:"running"}` — the
  running predicate (discover + heartbeat + `/health`) end-to-end.
- `/ops/rag/ops-state` = vault 2036, code 9855 from live `/service-state`; tenants from
  `/projects`; `storage.available:false` (honest degrade — the live service is local mode,
  `/storage/survey` 404s).
- `/ops/rag/collection-health` = `supported:false, reason:"Qdrant has no HTTP endpoint
  (local-only mode); Tier-2 health needs server mode"` — the local-mode honest-degrade fix.
- `POST /ops/rag/server-start` while running = HTTP 200 `already_running, attached:true,
  pid:46676` — the central D1 fix, live: no 502, attaches without spawning.
- bad `port:80` = HTTP 400 (the injection guard).
- The live rag service stayed `ready` (pid 46676) throughout — fully non-destructive.

Test gate: rag-client 37 + vaultspec-api 130 (cargo); frontend tsc/eslint/prettier/`lint:px`
clean + `opsActions.test.ts` 14 passed (live-engine globalSetup booted).

## Recommendations

- Complete the single outstanding verification: a live browser render of the console (the
  backend it consumes is now live-proven; the console compiles + lints + booted under the
  live-engine test harness).
- File the four coordination asks (in the reference doc) as rag GitHub issues when the owner
  approves the outward action.
- Future pass: `spawn_blocking` the probe; full keymap/palette enrollment of the console
  lifecycle verbs.

## Codification candidates

None new — the three durable rules were codified during the cycle
(`rag-is-a-machine-singleton-the-dashboard-attaches-never-owns`,
`rag-data-rides-the-codified-contract-not-the-qdrant-shape`,
`dashboard-does-not-override-rag-status-dir`).
