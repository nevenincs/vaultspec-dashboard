---
tags:
  - '#plan'
  - '#test-infra-hardening'
date: '2026-07-02'
modified: '2026-07-17'
tier: L2
related:
  - '[[2026-07-02-test-infra-hardening-audit]]'
  - '[[2026-07-13-test-infra-hardening-adr]]'
  - '[[2026-07-13-test-infra-hardening-research]]'
---
# `test-infra-hardening` plan

### Phase `P01` - Timeout policy

Build a shared engine-round-trip timeout policy and a wrapped waitFor, then sweep the frontend test suite's waitFor callsites onto it.

- [x] `P01.S01` - TIH-002: build frontend/src/testing/timing.ts (engine-round-trip timeout policy as data plus a wrapped waitFor) and sweep the roughly 25 test files and 116 waitFor callsites onto it, the GS-007 VaultBrowser ENGINE_WAIT fix is the first consumer; `frontend/src/testing/timing.ts`.

### Phase `P02` - Engine quiescence barrier

Add an engine-quiescence barrier to the live-engine global setup and render-suite beforeAlls so waits do not race write-triggered rebuild storms.

- [x] `P02.S02` - TIH-003 plus TIH-006: add awaitEngineQuiescent() (tiers-available plus generation-stable over /status) to the live-engine global setup and render-suite beforeAlls, so waits do not race write-triggered rebuild storms, closes the file-1 declared-fold-in-flight gap; `frontend/src/testing/liveEngine.globalSetup.ts`.
- [x] `P02.S06` - TIH-007: fix the VaultBrowser cross-test server-side selection leak (a leaked selected_ids let the GS-003 reveal reaction re-render the tree and detach a captured element) via beforeEach dashboard-state reset plus follow-off, close the happy-dom drain blind spot (raw patch invisible to the isFetching drain) that produced the AbortError class; `frontend/src/app/left/VaultBrowser.render.test.tsx + frontend/src/testing/liveSetup.ts`.

### Phase `P03` - Write hygiene / fixture isolation

Make write-touching suites restore state after themselves so later suites are not coupled to run order.

- [x] `P03.S03` - TIH-004: write suites restore state, sacrificial-document plus preimage restore in afterAll, settings and session snapshot-restore, per-suite scratch scopes, so later suites are not run-order-coupled; `frontend/src/testing/`.

### Phase `P04` - Engine binary selection

Guard the test harness's engine binary selection against racing an in-flight cargo build.

- [x] `P04.S04` - TIH-005: add a VAULTSPEC_TEST_ENGINE_BIN override plus a chosen-binary banner so the mtime-picked engine binary cannot race an in-flight cargo build; `frontend/src/testing/liveEngine.globalSetup.ts`.

### Phase `P05` - Measurement

Instrument per-file suite timing and capture baseline plus post-fix measurements so the campaign closes with measured evidence.

- [x] `P05.S05` - TIH-instrumentation: a per-file wall-clock vitest reporter, capture a baseline run and a post-fix run so the campaign closes with measured evidence; `frontend/vitest.config.ts`.

## Description

Remediation of the test-infra-hardening audit (TIH-002/003 HIGH, TIH-004 MED, TIH-005/006 LOW; TIH-001 sound). Bounded, zero-product-risk test-infra fixes; land P01/P02 before the external ASA team's W09 wave.

## Steps

## Parallelization

## Verification
