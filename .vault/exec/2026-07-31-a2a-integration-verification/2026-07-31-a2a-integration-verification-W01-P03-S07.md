---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:aef1f2307d4690b938e4fb62e3710b13399d4e8955da4011fe6a2e51316bdc61'
step_id: 'S07'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---

# Deliver four production-factory deterministic scripted scenarios

## Scope

- `src/vaultspec_a2a/team/presets/`

## Description

Add role-keyed deterministic presets for a tool call, generic permission pause,
failure, and cancel window. Prove each through the production ProviderFactory
and the appropriate direct worker/provider boundary, without presenting tape or
ACP/SSE semantics as completion evidence.

## Outcome

A2A revision `e865a7a1` adds four agent/team presets and direct scenario tests.
Focused evidence covers SQLite task advancement, generic worker pause/resume,
cause-preserving worker failure, and direct async-provider cancellation
propagation. Focused suite passed `23`; Ruff passed; Sol-medium review approved.

## Notes

Cancellation deliberately proves the direct async provider boundary rather than
claiming full gateway cancellation. Mock/VidaiMock tape files are unchanged and
remain optional supplemental coverage.
