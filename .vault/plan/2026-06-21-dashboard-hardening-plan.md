---
tags:
  - '#plan'
  - '#dashboard-hardening'
date: '2026-06-21'
modified: '2026-06-21'
tier: L3
related:
  - "[[2026-06-21-dashboard-hardening-adr]]"
---

# `dashboard-hardening` plan

Harden the dashboard across five axes (adversarial, mutation/destruction, degradation,
memory, performance); adversarial + engine mature by construction, the work is the
client + the brokered-mutation safety.

## Description

Execute the hardening decisions D1-D5 from the ADR. The engine is mature by
construction (the adversarial axis needed only residual fixes); the work concentrates
on the client (render-capability degradation + wire-read-adapter trust) and the
brokered-mutation safety (dry-run + reversibility). Memory + performance largely hold;
two scoped scene fixes remain. Each wave lands gate-green (full lint gate), committed
by pathspec, sequenced around shared-tree concurrency. Authorizing decisions are in the
ADR (`related:`); findings in the audit.

## Steps

## Wave `W01` - client render-capability degradation (HIGH)

The scene detects GPU-loss/no-GPU/headless and emits a render-capability signal; the
stores hold it; the app renders an honest degraded state. Shipped + E2E-verified.

### Phase `W01.P01` - scene emit side

Detect + recover + report via the SceneController event channel.

- [x] `W01.P01.S01` - add the `render-capability` variant to the SceneEvent union; `frontend/src/scene/three/sceneController.ts`.
- [x] `W01.P01.S02` - two-tier renderer ctor (real-GPU then software-fallback then no-GL) + powerPreference; `frontend/src/scene/three/threeField.ts`.
- [x] `W01.P01.S03` - webglcontextlost/restored handlers (preventDefault, pause, GL rebuild from persisted layout) + bounded retry; `frontend/src/scene/three/threeField.ts`.

### Phase `W01.P02` - stores + app consume/render

- [x] `W01.P02.S04` - `renderCapability` view-store field + stageSceneEvents handler; `frontend/src/stores/`.
- [x] `W01.P02.S05` - resolveCanvasState render-unavailable/context-lost states (precedence after awaiting-scope); `frontend/src/app/`.
- [x] `W01.P02.S06` - CanvasStateOverlay plain-copy cards + tests; `frontend/src/app/`.

## Wave `W02` - wire-read adapter trust boundary (HIGH/MED)

The client defensively bounds every wire-ingestion point. Adversarial-client HIGHs
closed.

### Phase `W02.P03` - defensive bounds

- [x] `W02.P03.S07` - client payload ceiling + honest truncation (G2); `frontend/src/stores/server/liveAdapters.ts`.
- [x] `W02.P03.S08` - prototype-pollution guard, null-prototype/key-filter (G3); `frontend/src/stores/server/liveAdapters.ts`.
- [x] `W02.P03.S09` - hostile-fixture suite (G4); `frontend/src/stores/__adversarial__/`.

## Wave `W03` - residuals + codify

### Phase `W03.P04` - engine residuals + closeout

- [x] `W03.P04.S10` - capability-probe timeout + events_in_range LIMIT; engine.
- [x] `W03.P04.S11` - bearer-gate drift + structural anti-drift guard + regex length cap; engine.
- [ ] `W03.P04.S12` - SSE per-frame data bound (G5, LOW); `frontend/src/stores/`.
- [ ] `W03.P04.S13` - codify the 4 rules + reconcile mock-mirrors-live-wire-shape.

## Wave `W04` - mutation/destruction safety (D5)

Every brokered mutation is authorized, blast-radius-bounded, and reversible/safe.

### Phase `W04.P05` - destructive-verb safety

- [x] `W04.P05.S14` - broker archive --dry-run + add the unarchive route + autofix --dry-run; engine.
- [x] `W04.P05.S15` - complete CONTRACT_ROUTES so the anti-drift guard covers the mutation routes; engine.

## Wave `W05` - memory-safety

### Phase `W05.P06` - scene wire-ingestion bound

- [x] `W05.P06.S16` - scene-side node ceiling at data-ingestion (second client wire boundary); `frontend/src/scene/`.

## Wave `W06` - performance

### Phase `W06.P07` - hotspots + adaptivity

- [x] `W06.P07.S17` - bind_steps_to_exec_records O(S x E) to HashSet O(S+E); engine.
- [x] `W06.P07.S18` - FPS-adaptive LOD (throttle labels then node cap then instancing); `frontend/src/scene/`.

## Parallelization

Waves are largely independent (different layers) and ran concurrently rather than
strictly sequenced: W03/W04/W06 engine work landed in parallel with W01/W02 client
work. Hard couplings: W01.P02 needs W01.P01's SceneEvent variant before it typechecks;
client commits held for clean windows where files were contended by concurrent
campaigns. Remaining open Steps (S12, S13, S16, S18) are independent and parallelizable.

## Verification

Each wave lands full-gate green (`declaring-green-runs-the-full-gate`). Specific
criteria: render-capability verified end-to-end (signal -> state -> render, with the
garbage-signal -> renders-anyway fail-safe) - MET; headless software-WebGL renders the
full graph - MET; the bearer anti-drift guard asserts every data route requires the
bearer - MET; mutation verbs preview (dry-run) + reverse (unarchive) - MET; engine
memory-safe (zero unsafe, bounded accumulators) - MET; engine perf invariants hold
(ceiling, memoize-on-generation, linear ingest) - MET. Open: degraded-state
screenshots reviewed by the user (show-first); the scene node-ceiling + FPS-adaptive
LOD landed gate-green; the final security-review + codify. The plan is complete when
every Step is closed and task #8 (verify + security-review + codify) signs off.
