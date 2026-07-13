---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Run the full gate, live-verify cold-start payloads and first paint, review the diff, commit

## Scope

- `frontend (full gate) + live verify`

## Description

Run the gate and verify live: just dev lint frontend exit 0; full vitest 311 files / 2844 tests green; Playwright cold-start census re-run on the rebuilt dev stack; adversarial review of the diff.

## Outcome

Verdict approve-with-nits, zero CRITICAL/HIGH (one MEDIUM tautological test assertion, fixed). Live census: desktop cold start now paints constellation (~119KB) + tree first page (84KB) with document slice (2.3MB) and tree remainder (656KB) arriving as background enrichment; compact still issues zero graph queries. Reviewer's optional note recorded: a tiers-less transport error during the fill shows the constellation instead of the unavailable card - accepted as the graceful intended outcome (shared origin makes it near-unreachable).

## Notes
