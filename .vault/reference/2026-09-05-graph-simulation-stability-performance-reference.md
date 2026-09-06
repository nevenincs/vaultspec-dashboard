---
tags:
  - '#reference'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:0ba26b52111db4c0a9f52ec763a83f04191704aa8eefda7f7bf072d38ab0ab9c'
related:
  - "[[2026-07-03-graph-simulation-stability-adr]]"
  - "[[2026-09-05-graph-simulation-stability-force-balance-reference]]"
---

# `graph-simulation-stability` reference: `performance`

## Summary

Measured performance of the drift-corrected implementation at commit `4ece5c1a`, supplemented by independent force-kernel and scene-host reviews. Subsequent documentation commits did not change the audited scene sources. The related performance audit owns severity, open findings, and recommendations; this reference owns the measurement evidence and reproduction conditions.

### Environment and limits

Windows, AMD Ryzen 9 5900X (12 cores / 24 logical processors), NVIDIA RTX 4080 SUPER using ANGLE Direct3D11, Chrome 145.0.0.0, Node 24.12.0. Hardware WebGL was confirmed, not SwiftShader. One isolated browser context ran the existing graph lab against the real production `ThreeField` and solver modules. No parallel timing workload was deliberately run; OS activity, JIT, GC, and browser scheduling were not isolated.

The dev-domain Vite server used `npx vite --config vite.dev.config.ts --host 127.0.0.1 --port 8776 --strictPort`, with the page at `http://127.0.0.1:8776/labs/three/`. Kernel timings are independent of viewport. Host measurements used the observed 1028 by 641 CSS-pixel viewport and 1028 by 607 field at DPR 1; the requested larger window was not achieved. This was a development build, not a production-bundle/mobile/low-end-device certification.

Fixtures are deterministic synthetic scene inputs, not captured user graphs or substitutes for the engine wire. Defaults were unchanged: charge -120, minimum distance 10, maximum 400, theta 0.5, collision padding 3, strength 0.35, one iteration, velocity decay 0.5, alpha decay 0.03. No added cooling or damping was used. Stock d3 comparisons measure kernel cost, not physical equivalence or permission to revert the drift fix.

Measurements use `performance.now()`. Kernel calls use five warmups followed by 30 recorded samples with alternating implementation order and velocities reset outside timing. Unless stated otherwise, table cells are mean / p95 milliseconds. The empirical p95 is sorted sample index `floor(0.95 * n)`; small-sample tails are descriptive, not stable SLO estimates. Render measurements are CPU submission plus canvas overlays, not GPU timer-query duration, presentation FPS, or INP.

The dev-server log also contained a duplicate `ReactDOMClient.createRoot` warning during the diagnostic session. Its cause was not established by this audit. These are therefore diagnostic measurements of the mounted field and isolated kernels, not a clean production-mount acceptance run; repeat the host measurements on a clean production mount before performance sign-off.

### Static force-kernel matrix

Cold: golden-angle phyllotaxis with radius `10 * sqrt(i + 0.5)`. Dense: same angles with radius multiplier 3. Line: `x = 40 * i, y = 0`. Node radii are `4 + i % 17`. A ternary parent tree determines degree-based masses; links are not executed in these isolated force calls. Positions stay fixed. Each force is independently initialized with the same seeded generator.

| Nodes / shape       | Reciprocal charge | Stock d3 charge | Mass-wrapped charge | Mass contact  | Stock d3 contact |
| ------------------- | ----------------- | --------------- | ------------------- | ------------- | ---------------- |
| 500 cold            | 3.52 / 3.80       | 4.18 / 4.70     | 3.52 / 4.00         | 1.24 / 1.60   | 1.96 / 2.40      |
| 1,200 cold          | 12.88 / 13.90     | 12.31 / 14.70   | 12.90 / 14.40       | 2.93 / 3.50   | 4.84 / 6.20      |
| 5,000 cold, repeat  | 86.96 / 91.00     | 67.92 / 73.70   | 87.52 / 92.60       | 13.84 / 15.50 | 18.69 / 25.90    |
| 1,200 dense         | 7.72 / 8.40       | 12.94 / 14.90   | 7.74 / 9.00         | 10.91 / 12.20 | 11.32 / 13.10    |
| 5,000 dense, repeat | 44.50 / 47.50     | 69.30 / 74.50   | 44.55 / 47.70       | 56.35 / 60.80 | 59.57 / 82.60    |
| 5,000 line          | 2.28 / 2.90       | 15.87 / 21.20   | 2.33 / 2.80         | 5.78 / 9.20   | 4.31 / 7.10      |
| 20,000 line         | 10.02 / 14.40     | 78.34 / 91.30   | 10.13 / 12.90       | 23.96 / 29.80 | 20.38 / 27.50    |

The first 5,000-cold run was 86.75 ms reciprocal versus 64.61 ms stock; the repeat above was about 28% slower rather than 34%. The first 5,000-dense run had greater variation: reciprocal 36.76 ms mean / 40.90 ms median, contact 46.24 / 52.50, stock charge 56.29 / 64.90. The repeated dense run is used in the table. A universal percentage regression is not supported: reciprocal charge wins on the measured dense and distant-line fixtures, but loses on the cutoff-boundary-heavy cold fixture.

The 20,000-node line is a bounded sparse stress sample, not evidence that arbitrary 20,000-node layouts are interactive. The regular engine slice is limited to 5,000; the scene defensive cap is 20,000. Fully coincident and large mixed-radius pathological layouts were reviewed statically, not benchmarked at the cap.

### Arithmetic-only browser prototype

A temporary Blob module copied the transformed reciprocal-force module and replaced the existing `const squared = dx * dx + dy * dy;` declaration in `impulse` with the following declaration and fast path. The existing softened/coincident/non-finite fallback stayed intact. The Blob URL was revoked; no production file was edited.

```javascript
const squared = dx * dx + dy * dy;
if (squared > 0 && Number.isFinite(squared) && squared >= minimum * minimum) {
  if (squared >= maximum2) return false;
  const coefficient = chargeAlpha / squared;
  if (Number.isFinite(coefficient)) {
    impulseX = dx * coefficient;
    impulseY = dy * coefficient;
    return true;
  }
}
```

| Fixture            | Current mean / p95 | Candidate mean / p95 | Relative velocity RMS difference |
| ------------------ | ------------------ | -------------------- | -------------------------------- |
| 1,200 cold         | 13.38 / 14.40      | 10.42 / 11.00        | 1.42e-16                         |
| 5,000 cold         | 91.13 / 97.50      | 78.50 / 84.40        | 2.09e-16                         |
| 5,000 cold, repeat | 86.77 / 89.90      | 74.32 / 77.20        | 2.09e-16                         |
| 5,000 line         | 3.52 / 3.90        | 3.27 / 3.60          | 2.54e-16                         |

The observed reduction is about 14% at 5,000 cold and 22% at 1,200 cold. Roundoff-scale differences on these fixtures do not constitute conservation, determinism, extreme-coordinate, or convergence regression coverage. Even the improved cold kernel remains far above a 16.67 ms whole-frame budget.

### Full scene and interaction measurements

The scene-shaped fixture contains approximately `sqrt(count) / 2` feature hubs, document nodes with deterministic document types and degree metadata, one membership edge per document, and one additional deterministic document edge after the first few documents. Counts are 1,200 nodes / 2,348 edges and 5,000 / 9,894. This exercises production radius calculations that the simpler lab sample omits. The measured 5,000-node radii span 6.23 to 19.92 world units.

Cold `setData` ran with reset enabled and simulation unfrozen, followed by a nominal three-second real rAF sample. Actual `frame`, `solver.tick`, and `renderFrame` calls were wrapped with bounded timing arrays; all wrappers were restored. Autoframe was disabled to isolate simulation. Icons and minimap were off for this sample. The timer can complete late when callbacks block. No frame rate or input latency was inferred from sample count.

| Nodes | Cold setData incl. prewarm | Solver tick mean / p95 | Callback median / p95 | Render CPU median / p95 | Samples                 |
| ----- | -------------------------- | ---------------------- | --------------------- | ----------------------- | ----------------------- |
| 1,200 | 285.50                     | 17.69 / 19.00          | 53.50 / 56.30         | 0.50 / 1.10             | 52 callbacks, 152 ticks |
| 5,000 | 400.10                     | 122.87 / 129.60        | 373.90 / 381.30       | 0.80 / 19.50            | 10 callbacks, 27 ticks  |

At 5,000 nodes the initial callback had zero ticks and the following nine each ran three. Render cost EMA ended at 1.31 ms with `perfDegraded = false`. At 1,200 nodes almost all callbacks also ran three ticks; the EMA ended at 0.55 ms. The prewarm setting is 260 ms, checked between ticks; whole `setData` includes graph construction too.

After the 5,000-node live sample, manual stepping continued until the solver naturally reported settled, stopping immediately at that condition. Another 510 ticks took 65,939.20 ms of summed CPU time, excluding tool pauses and the earlier prewarm/live ticks. This is remaining solver work for this fixture, not a measured continuous end-to-end settle duration.

A document leaf was then grabbed from its settled position and its cursor pin displaced by 80 world units. Five warmups and 30 recorded actual solver ticks held the target. Every recorded tick reported one free awake node, plus the cursor-held node. The full tick remained 131.52 ms mean / 137.30 ms p95. Per-force means were charge 113.42, collision 16.99, link 0.52, x-centering 0.21, and y-centering 0.05 ms. Wrappers add small instrumentation overhead; their initialization and restoration are outside samples. This directly demonstrates that the motion-local active set is not a compute-local active set.

### Rebuild, overlays, idle, and resource observations

Identical frozen `setData` updates were timed eight times, discarding the first two, with `getComputedStyle` calls counted and the prior solver identity compared. Simulation is frozen, so this isolates CPU rebuild work without ticks or subsequent rendering.

| Nodes | First frozen reset build | Identical rebuild mean / p95 | Computed-style reads per rebuild | Solver replaced |
| ----- | ------------------------ | ---------------------------- | -------------------------------- | --------------- |
| 1,200 | 23.10                    | 13.60 / 15.30                | 1,202                            | Yes             |
| 5,000 | 55.90                    | 45.32 / 57.80                | 5,002                            | Yes             |

At 5,000 nodes, 10 warmups and 50 synchronous samples on a late-anneal layout measured the following. Position packing/upload happened before this microbenchmark. The minimap was attached through the real field method using a 192 by 120 canvas. Results are CPU call costs, not actual presented frames.

| Operation                                       | Mean / p95 ms          |
| ----------------------------------------------- | ---------------------- |
| Graph bounds                                    | 0.78 / 0.90            |
| Uncached pick                                   | 0.91 / 1.20            |
| Cached identical pick                           | Below timer resolution |
| Labels                                          | 0.31 / 0.40            |
| Minimap                                         | 1.68 / 2.00            |
| Full render submission and overlays, minimap on | 1.98 / 2.30            |
| Same with icons on                              | 2.00 / 2.30            |

A bounded idle check explicitly put the graph into its pinned rest state, finished camera easing, cleared pending display/emphasis work, and enabled autoframe polling. Over 2.1 seconds, bounds ran five times and render ran zero times. Thus settled render-on-demand works, but visible autoframe still scans bounds periodically.

Twenty successive frozen rebuild-and-render cycles at 5,000 nodes kept the renderer's tracked resource counts stable at two geometries, two textures, and two programs. This is a narrow resource-lifetime smoke check, not a JS heap, allocation-rate, retained-object, context-loss, or long-duration leak audit.

### Reproduction essentials

Use the existing dev lab and `window.__threeField` in an isolated page; do not use the stale scratch harnesses referring to port 5176 or a removed `three.html`. Load the production source modules through Vite, freeze the field, stop its scheduled rAF, and disable autoframe while timing kernels. Never run CPU benchmarks concurrently. Restore wrapped methods and global functions in `finally`, then close the isolated page and stop only the server started for the audit.

The scene fixture used by the host measurements is reproduced below. It is a direct scene input fixture, not an engine protocol payload.

```javascript
function makeScene(count) {
  const nodes = [], edges = [];
  const groups = Math.max(3, Math.round(Math.sqrt(count) / 2));
  const stable = s => {
    const v = Math.sin(s * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let g = 0; g < groups; g++) {
    nodes.push({
      id: `feature:${g}`, kind: 'feature', title: `Group ${g}`,
      featureTags: [`f${g}`], memberCount: Math.floor(count / groups),
      degreeByTier: { declared: Math.floor(count / groups),
        structural: 0, temporal: 0, semantic: 0 },
    });
  }
  for (let i = 0; nodes.length < count; i++) {
    const group = i % groups;
    nodes.push({
      id: `doc:${i}`, kind: 'document',
      docType: ['adr', 'plan', 'exec', 'audit', 'research', 'reference'][i % 6],
      title: `Document ${i} performance sample`,
      featureTags: [`f${group}`], salience: stable(i),
      degreeByTier: { declared: 2, structural: i % 3, temporal: 1, semantic: 1 },
    });
    edges.push({
      id: `hub:${i}`, src: `doc:${i}`, dst: `feature:${group}`,
      relation: 'member', tier: 'declared', confidence: 0.9,
    });
    if (i > groups) edges.push({
      id: `cross:${i}`, src: `doc:${i}`, dst: `doc:${Math.floor(stable(i * 7) * i)}`,
      relation: 'relates', tier: 'declared', confidence: 0.6,
    });
  }
  return { nodes, edges };
}
```

For static forces, initialize each implementation on the same node array with its own generator `s = 1; s = (Math.imul(1664525, s) + 1013904223) | 0; return (s >>> 0) / 4294967296`. Execute all implementations in alternating forward/reverse order for 35 rounds, reset each node's `vx` and `vy` to zero before each timed call, and invoke force alpha 0.3. Stock charge uses the same charge/min/max/theta values; stock contact uses `radius + 3`, strength 0.35, one iteration. The mass wrapper encloses the reciprocal force and uses `max(1, degree)` from the fixture edges.

Host recipe: freeze and cancel the field's scheduled rAF before each case. After `cancelAnimationFrame(field.raf)`, clear `field.scheduled = false` (and clear the canceled handle, for example `field.raf = 0`) so `wake()` can schedule a new callback; merely canceling without resetting the flag leaves the loop blocked. For rebuilds call `setData(nodes, edges, false, false, true)` once, then eight identical default `setData` calls. For cold-to-live use the same reset call with `frozen = false`, cancel its just-scheduled callback, wrap the real methods, and resume with `setRunning(true)` and `wake()`. Collect until a three-second timer resolves; then freeze, cancel, and restore methods. To reproduce the local-drag case, finish `tick()` only while `!isSettled()`, take the last node's position, call `setDrag(index, x, y)` followed by `setDrag(index, x + 80, y)`, and measure 35 ticks with the first five discarded.

### Source ownership and remaining verification

Force construction, pinning, anneal, and retunes: `frontend/src/scene/three/d3ForceSolver.ts`. Reciprocal tree traversal, cutoff tests, impulse arithmetic, and typed storage: `frontend/src/scene/three/symmetricManyBody.ts`. Mass conversion and grid contacts: `frontend/src/scene/three/d3ForceMass.ts`. Host scheduling/LOD: `frontend/src/scene/three/threeField/simulation.ts`. Rebuild lifecycle: `frontend/src/scene/three/threeField/data.ts`. Bounds/minimap/autoframe: `frontend/src/scene/three/threeField/viewport.ts`. Picking: `frontend/src/scene/three/threeField/interaction.ts`. Radius derivation: `frontend/src/scene/three/appearance.ts`.

Still required before performance sign-off: representative captured backend graphs, production build, slower CPUs/integrated GPUs, high DPR and high refresh, full interaction/event latency traces, dense and heterogeneous radii at supported caps, delta-reflow workloads, sustained slider allocation/heap profiles, and repeated statistical runs. The current evidence identifies bottlenecks; it does not certify that everything is optimized. The force-balance acceptance evidence remains in the related force-balance reference rather than being restated here.

### Engineering feasibility follow-up

The reciprocal tree is built from all node coordinates; aggregate impulses propagate only from parent to descendants. A conservative pruning candidate adds per-cell movable counts using `fx == null || fy == null`, without changing the tree partition or its centers. For two distinct cells containing only fully pinned nodes, strictly disjoint axis-aligned bounds prove that no exact pair is coincident; skipping that branch cannot change a free descendant's accumulated force or consume a coincidence random draw. Self-cell and overlapping fixed-cell traversal remain intact. This is a source-derived feasibility argument, not a benchmark or completed correctness proof. See `frontend/src/scene/three/symmetricManyBody.ts:44`, `:72`, and `:116`.

Host reuse needs a stronger comparison than the warm-swap classifier. `frontend/src/scene/three/swapClassifier.ts:93` stores unordered endpoint pairs in sets, while `D3ForceSolver` constructs masses and sequential link evaluation from the resolved edge list. Order and multiplicity therefore matter for solver reuse even when the classifier sees the same endpoint set. The current teardown also stops running, cancels interaction, resets the clock and clears derived state in `frontend/src/scene/three/threeField/gpuResources.ts:550`; `setData` clears hover and visibility before rebuilding in `frontend/src/scene/three/threeField/data.ts:291`. A reuse path must classify these command effects explicitly rather than accidentally bypassing them.

`SimulationClock.consume` removes all returned whole steps immediately and retains the fraction (`frontend/src/scene/three/threeField/simulationClock.ts:13`). Introducing an execution-time budget solely by breaking the host loop would silently discard returned-but-unexecuted whole steps. A scheduling refinement needs an explicit consumed/executed/discarded-time contract. The existing live loop and tests are the relevant integration boundaries (`frontend/src/scene/three/threeField/simulation.ts:379`, `frontend/src/scene/three/threeField.clock.test.ts:5`).

The numeric CSS reader performs its own computed-style read, whereas the string reader already accepts a pre-resolved declaration (`frontend/src/scene/field/tokenReads.ts:55`, `:80`). A build-scoped numeric reader/palette can follow that pattern without a global indefinitely cached theme value. This is an invalidation design candidate; preserve non-hex parsing and fallback behavior.

For collision traversal, a second per-cell movable-only linked list could retain the original descending-index order. Movable outer nodes would still visit the full grid; fully fixed outer nodes could use movable-only candidates for different actual cell keys while retaining the full list for their own key. Fixed-fixed coincidence draws would therefore remain in their original position in the traversal. Compare generated keys rather than neighbor offsets: extreme coordinates can make adjacent numeric offsets alias to the same key. This candidate deliberately leaves same-cell fixed-fixed work quadratic in the coincident case. Source: `frontend/src/scene/three/d3ForceMass.ts:62` through `:111`.

The equivalence boundary is free-coordinate outputs and future solver state, not temporary velocities on fully pinned nodes. Current production force order is link, charge, collision, x-centering, y-centering (`frontend/src/scene/three/d3ForceSolver.ts:294`); collision uses fixed coordinates instead of predicted velocity on pinned axes (`frontend/src/scene/three/d3ForceMass.ts:67`), and d3 integration resets pinned velocities before the next tick (`frontend/node_modules/d3-force/src/simulation.js:53`). Keep d3 links untouched because they read and mutate intermediate endpoint velocities sequentially (`frontend/node_modules/d3-force/src/link.js:36`). Validate pruning independently from arithmetic reassociation so bitwise free-output/RNG comparisons can isolate pruning correctness. New test coverage is required for partially pinned axes, fixed coincidences before free coincidences, mixed node ordering, multiple collision iterations, aliased grid keys, and multi-tick wake/drag/release/reflow.
