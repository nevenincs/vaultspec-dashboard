---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S20'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Run the full code review of the campaign and resolve required revisions

## Scope

- `.vault/audit/2026-06-26-rag-service-management-audit.md`

## Description

- Ran an adversarial code review (vaultspec-code-reviewer) over the whole campaign diff (engine + stores + console) against the ADR and the project rules. Verdict: PASS-WITH-REVISIONS (1 HIGH, 3 MEDIUM, 4 LOW; no CRITICAL). It confirmed the central D1 invariant (never 502 an already-running start), the hot-path / engine-read-and-infer / bounded / injection / stable-selectors / no-px disciplines all hold.
- HIGH (rag-start-readiness-001): a single 1.5s post-start `/health` re-probe misreported a slow cold start (GPU model load) as failed. FIXED: trust `exit 0` as authoritative "started" (rag exits non-zero only on real failure), harvest pid/port best-effort without downgrading; on non-zero exit, use a bounded settle re-probe (`reprobe_rag_until_running`, 4 attempts) before declaring failed/needs_install.
- MEDIUM (lifecycle-stderr-004): FIXED - `run_rag_lifecycle_capture` now drains stdout AND stderr concurrently (bounded), and the needs-install heuristic + surfaced `output` scan the combined text (rag prints the install hint to stderr); also removes the undrained-pipe block hazard.
- MEDIUM (console-intent-gap-002): PARTIALLY FIXED - added `needs_install` to `RagStartStatus` + the interpreter, and the console now surfaces the start outcome (failure reason / needs-install hint) via `interpretRagStartEnvelope(start.data)`.

## Outcome

Required revisions resolved and re-verified: `cargo test -p vaultspec-api --lib` 130 passed; frontend tsc/eslint/prettier clean. The campaign is green on its own slice.

## Notes

Accepted deferrals (recorded, not blocking): the restart/doctor/install lifecycle affordances and the start-arg UI (`--local-only`/`--port`/`--qdrant-auto-provision`) are engine-ready but not yet surfaced as console controls (console-intent-gap-002 residue); lifecycle verbs route the action plane via the dispatch seam rather than full ActionDescriptor/keymap enrollment (action-descriptor-003 - consistent with the sibling rag data verbs, accepted); LOWs (spawn_blocking the probe, a typed discovery-reason enum, consuming/dropping `rag.reason`, confirming `/health` carries `qdrant.version`) noted as follow-ups. LIVE render verification of the console + a live attach/start round-trip against rag 0.2.25 remain the outstanding end-to-end checks (the unit/integration slice is green); the HIGH fix removes the timing dependency the live test would have exposed.
