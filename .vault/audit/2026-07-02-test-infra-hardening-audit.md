---
tags:
  - '#audit'
  - '#test-infra-hardening'
date: '2026-07-02'
modified: '2026-07-02'
related: []
---

# `test-infra-hardening` audit: `shared live-engine frontend test infrastructure`

## Scope

Standing architecture audit of the shared live-engine frontend test
infrastructure — the disease behind the GS-007 flake symptom
(`VaultBrowser.render.test.tsx` waitFor timeouts under cumulative load). The
suite runs ~2,500 tests across 150+ files ONLINE against ONE real
`vaultspec serve` (`frontend/src/testing/liveEngine.globalSetup.ts`,
`fileParallelism: false` in `frontend/vite.config.ts:83-107`). Audited: the
engine boot/teardown lifecycle, per-suite transport and scope resolution
(`frontend/src/testing/liveClient.ts`, `liveSetup.ts`), timeout policy across
test files, write-load on the shared engine and its server-side consequences
(`vaultspec-api/src/registry.rs` watcher/fold path, `app.rs` rebuild path), and
fixture-state determinism. Grounded in `mock-mirrors-live-wire-shape`
(no-mocks/no-shadows), `dev-servers-bind-explicit-non-default-strict-ports`,
and `bounded-by-default-for-every-accumulator`. Read-only; finding IDs `TIH-###`.

CROSS-TEAM NOTE: the external agentic-spec-authoring-backend team's W09
acceptance gates run on THIS same suite; every fix here directly de-risks their
integration wave.

## Findings

### TIH-001 | info | Architecture verified sound at the foundations: the no-mocks live suite, scratch isolation, and port discipline are right

For the record before the defects: the load-bearing choices are correct and
must survive any hardening. (a) The suite runs online against the REAL engine
over a committed deterministic fixture vault copied to a scratch dir with its
own engine-data cache and a fixed-date git history — no mock to drift
(`mock-mirrors-live-wire-shape` satisfied by construction;
`liveEngine.globalSetup.ts:1-64`). (b) The OS-assigned ephemeral port is the
explicitly SANCTIONED exception in `dev-servers-bind-explicit-non-default-
strict-ports` (strongest anti-collision for an automated, possibly-parallel
test process; `freePort()`, `:66-77`). (c) An externally-provided engine is
adopted via `ENGINE_BASE_URL` (CI path, `:95-99`). (d) A real degraded sibling
worktree gives degradation tests a genuine down tier, never a stubbed tiers
block (`:129-137`). (e) The per-file async drain in `liveSetup.ts` (#28) keeps
happy-dom teardown aborts inside the owning file. (f) `fileParallelism: false`
is a CORRECT consequence of one shared mutable engine — the defect is not the
serialization but what rides on it (TIH-003/004).

### TIH-002 | high | Timeout policy inversion: 115 of 116 waitFor gates run at the 1-second library default against a live engine budgeted at 15 seconds

The suite's effective assertion gate is not the configured budget. Vitest gives
each test 15s (`testTimeout: 15_000`) and hooks 35s precisely because "the
engine cold-indexes the fixture on boot" — but the actual gate on nearly every
live render assertion is testing-library's `waitFor` DEFAULT: 1,000ms (50ms
polling). Measured: 116 `waitFor(` callsites across 25 test files; exactly ONE
passes an explicit `timeout` (`searchController.test.ts`). The flake site is
the densest consumer: `VaultBrowser.render.test.tsx` alone has 18 default-1s
gates, including the afterEach `isFetching()===0` drain (`:64`) that races a
BACKGROUND dashboard-state fetch against the shared engine. Failure scenario
(the GS-007 mechanism's front half): any transient engine latency above ~1s —
a rebuild, a cold projection, a core subprocess hogging the CPU (TIH-003) —
fails an assertion 14 seconds before the test's actual budget expires. Timeout
policy is scattered as an invisible library default, violating the spirit of
timeout-policy-as-data. Fix shape: one shared test-timing module (e.g.
`testing/timing.ts`) exporting policy constants (interactive-render gate,
engine-settle gate, drain gate) and a wrapped `waitFor` defaulting to the
engine-appropriate gate; the ready GS-007 headroom fix is the first consumer,
then a mechanical sweep of the 25 files.

### TIH-003 | high | Write-triggered rebuild storms: 148 write callsites across 28 files each detonate a debounced re-index + a Python core subprocess + full cache invalidation on the engine every later suite reads from

The cumulative-load mechanism behind GS-007's back half. Measured: 148
engine-write callsites (`opsCoreWrite`/`set-body`/`patchDashboardState`/
`putSetting`/`dispatchOps` family) across 28 test files, serialized before and
between the render suites. Server-side, every VAULT write triggers the
watcher's debounced pipeline (`engine-graph/src/watch.rs:61-92` →
`app.rs::rebuild_and_swap:760-780`): a structural re-index, a `commit_graph`
generation bump that INVALIDATES every per-generation memoized projection
(document views, meta-edges, salience basis, lineage nodes, vault-tree rows),
and `spawn_declared_fold` (`registry.rs:356-379`) — where the present-view
fingerprint cache (present-view-graph-reads-one-corpus-snapshot) MISSES on any
corpus change and spawns the `vaultspec-core vault graph` PYTHON subprocess
(seconds of interpreter startup on Windows). Consequence: a read-heavy render
suite that runs after (or interleaved with the trailing edge of) a write-heavy
suite pays cold-projection latency plus CPU contention from the fold
subprocess, exactly when its 1s waitFor gates (TIH-002) are ticking — latency
does not "grow" monotonically; it SPIKES behind each write burst, and with 28
write files spread through the sequence, later files sample more spikes. There
is NO quiescence barrier anywhere: the global setup polls only `/status` ok
(`liveEngine.globalSetup.ts:150-185`, declared fold still in flight at first
test), and no per-file hook awaits tiers-ready/no-fold-in-flight before a
render suite starts. Fix shape: a shared `awaitEngineQuiescent()` helper
(tiers all available + generation stable across a short window, via the
existing `/status` truth) used (a) once in global setup after boot, and (b) in
the beforeAll of render-assertion suites; optionally a test-profile watcher
debounce. This is bounded, additive, zero-product-risk.

### TIH-004 | medium | Fixture-state drift: write suites restore nothing, so the shared corpus every later suite asserts against is run-order-dependent

The write suites mutate the ONE shared fixture vault and no restore path
exists: `editorWriteSeam.test.tsx` (10 write callsites) contains no
`afterAll`/restore/revert (grep: zero matches), and no write suite re-applies
preimages at teardown. The scratch vault is fresh per RUN, so runs are
reproducible only insofar as file ORDER is stable — adding, removing, or
renaming any test file shifts which corpus state every later suite observes
(document counts, tree shapes, dashboard-state remnants, settings values:
`settingsEffects.test.tsx` alone has 19 write callsites against GLOBAL
settings). This is cross-file state coupling in a suite whose comments promise
determinism ("deterministic fixture vault"). It also multiplies TIH-003: every
un-reverted write is a permanent fingerprint change plus a rebuild. Fix shape
(pick per suite class): (a) write suites operate only on DEDICATED sacrificial
documents (a `fixtures/live-vault` sandbox subtree) and restore captured
preimages in `afterAll`; (b) settings/session suites snapshot-and-restore the
values they touch; (c) longer term, a per-suite scratch SCOPE (the engine
already serves multi-scope — a second worktree per write-suite family would
isolate writes from the render corpus entirely, at ~one `git worktree add`
each in global setup).

### TIH-005 | low | Engine binary resolved by mtime can race an in-flight cargo build

`resolveEngineBin()` (`liveEngine.globalSetup.ts:27-52`) picks the freshest of
`engine/target/{release,debug}` by mtime. On a dev machine with `cargo build`
in flight, the suite can grab a half-linked binary (spawn failure — loud) or,
subtler, a binary NEWER than the sources the test expectations were written
against while the dev server still runs the old one — two engines, two
behaviors, one developer. Fix shape: honor an explicit
`VAULTSPEC_TEST_ENGINE_BIN` override first (mirrors the `ENGINE_BASE_URL`
adopt path), keep mtime as the fallback, and log the chosen binary + build
profile in the setup banner so a mismatch is visible in the first line of a
failing run.

### TIH-006 | low | First-file cold-start reads race the async declared fold; the missing startup barrier is the same gap as TIH-003's

The global setup declares ready on the first `/status` 200 — but the declared
tier folds ASYNCHRONOUSLY after boot (perf ADR D1), so the earliest test files
run against a building tier: suites asserting declared-edge-dependent state
(graph edges, vault-tree completeness) inherit a race that today is absorbed
by luck and the 35s hookTimeout. Same remediation as TIH-003: point the
startup wait at `awaitEngineQuiescent()` instead of first-200, and the
cold-start and inter-suite cases close with one helper.

### TIH-007 | high | Re-diagnosis of the GS-007 crux: the persisting VaultBrowser:328 failure is a server-side selection leak racing the new reveal-on-selection reaction — not corpus unsettledness, and not progressive engine degradation

Escalation evidence: with the strengthened quiescence barrier wired into
VaultBrowser's beforeAll AND `ENGINE_WAIT` already on the failing waitFor, the run
went 0/4, every failure identical — `VaultBrowser.render.test.tsx:328`
(`expect(candidate).toBeTruthy()`, the `.vault/` leaf lookup after a folder click)
plus a `patchDashboardState` AbortError. Extended timeout + guaranteed-quiescent
engine and the leaf NEVER appears ⇒ this is not latency and not rebuild flux; the
click's effect is being lost. The causal chain, grounded in code: (1) the earlier
test in the same file ("clicking a document row drives the shared selection")
persists `selected_ids=[doc:X]` SERVER-side on the shared engine's scope — nothing
in the file's afterEach resets ENGINE dashboard state (only client caches are
cleared); (2) the write itself is the RAW `patchDashboardState`
(`stores/server/dashboardState.ts:239-251` — neither a TanStack query nor a
mutation), so the afterEach drain `waitFor(isFetching()===0)` cannot see it and
`liveSetup.ts`'s per-test `happyDOM.abort()` kills it in flight — the observed
AbortError, and nondeterminism in whether the server committed; (3) the
GS-003 reveal-on-selection reaction has since LANDED (`requestSelectionReveal` /
`useSelectionRevealStore`; `TreeBrowser.tsx:283-291` maps node→docType so a reveal
expands the `sec:documents` + `type:<docType>` ancestor path), and follow mode
defaults ON — so in the LAST test, the leaked selection arriving on the background
dashboard-state fetch triggers an ancestor-expansion re-render that either detaches
the already-captured collapsed-folder element (the test's `fireEvent.click` then
hits a dead node) or pre-expands the folder so the click COLLAPSES it — either way
no `.vault/` leaf mounts and the waitFor times out at ANY timeout. Why the barrier
correlated with WORSE results: a quiesced engine answers the leaked-selection fetch
FASTER and more consistently inside the race window (and n=4 vs n=4 is statistically
noise regardless — 2/4 vs 0/4 has p≈0.43). The dedicated reveal suite
(`TreeBrowser.reveal.render.test.tsx`) already knew this class: it resets server
dashboard state via `dashboardDocumentStateResetPatch` — VaultBrowser does not.
Verdict on the progressive-degradation theory: NOT supported as the cause — the
identical leaf lookup PASSES earlier in the same file (before any selection exists)
and fails only after one; engine resource growth would not produce that ordering.
FIX (test-side, deterministic, three small changes): (a) VaultBrowser beforeEach
resets server dashboard state (`patchDashboardState(dashboardDocumentStateResetPatch
(scope))`, exactly as the reveal suite does) — kills the leak at the root; (b) pin
`setFollowMode(false)` in suites that test disclosure mechanics, not reveal (reveal
has its own suite); (c) close the drain blind spot — the afterEach must drain
happy-dom's pending tasks (waitUntilComplete-style) or otherwise cover the raw
patch before `happyDOM.abort()`, so the AbortError class dies. BARRIER DISPOSITION:
keep, RESCOPED — global setup only (it deterministically closes the TIH-006
cold-fold window at one-time cost) plus optional post-write-suite use; remove from
per-render-suite beforeAlls where it buys nothing for this failure class. Its
polls should LOG wait-duration + generation — free telemetry that settles the
progressive-degradation question empirically alongside the per-file reporter.

## Recommendations

Ordered for a remediation plan (each independently landable, zero product
risk):

1. **Timing policy module + waitFor wrapper (TIH-002).** One
   `frontend/src/testing/timing.ts` with named gates as data; wrap `waitFor`;
   land the ready GS-007 headroom fix as its first consumer; sweep the 25
   files mechanically.
2. **`awaitEngineQuiescent()` helper (TIH-003 + TIH-006).** Tiers-available +
   generation-stable barrier over the existing `/status` truth; call it in
   global setup after boot and in render-suite `beforeAll`s.
3. **Write hygiene (TIH-004).** Sacrificial-document convention + preimage
   restore in `afterAll` for the write seams; snapshot-restore for
   settings/session suites; evaluate per-suite scratch scopes as the durable
   isolation once 1–3 stabilize the run.
4. **Binary resolution override + banner (TIH-005).**
5. **Instrument before/after:** capture per-file wall-clock from vitest
   reporters on one baseline run and one post-fix run so the remediation
   closes with measured evidence, not vibes.

Cross-team: schedule 1–2 BEFORE the ASA team's W09 integration wave lands its
vertical-slice and e2e suites — they will multiply both the write load and the
waitFor count on this same engine.
